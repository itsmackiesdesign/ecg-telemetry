"""Persistent FastAPI API used by the PulsePoint client."""
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4
from typing import Literal
import base64, json, sqlite3, secrets, logging, re
from contextlib import contextmanager
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import JSONResponse, FileResponse
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import jwt, JWTError
from passlib.context import CryptContext
from pydantic import BaseModel, Field, ConfigDict, ValidationError, field_validator, model_validator
from pydantic_settings import BaseSettings
from openai import AsyncOpenAI, AuthenticationError, RateLimitError, APITimeoutError, APIError, APIConnectionError, APIStatusError

logger = logging.getLogger('ecg.analysis')

ROOT = Path(__file__).resolve().parents[1]
class Settings(BaseSettings):
    database_path: str = str(ROOT / 'pulsepoint.db')
    jwt_secret: str = ''
    openai_api_key: str = ''
    openai_model: str = 'gpt-4o-mini'
    ecg_storage_dir: str = str(ROOT / 'storage')
    routing_base_url: str = 'https://router.project-osrm.org'
    frontend_dist: str = ''
    cors_origins: str = 'http://localhost:5174,http://127.0.0.1:5174'
    model_config = ConfigDict(env_file=str(ROOT / '.env'), extra='ignore')
settings = Settings()
store = Path(settings.ecg_storage_dir); store.mkdir(parents=True, exist_ok=True)
if not settings.jwt_secret or settings.jwt_secret == 'change-me':
    secret_file = ROOT / '.jwt-secret'
    if not secret_file.exists():
        secret_file.write_text(secrets.token_urlsafe(48)); secret_file.chmod(0o600)
    settings.jwt_secret = secret_file.read_text().strip()
@contextmanager
def database():
    db = sqlite3.connect(settings.database_path, timeout=20)
    db.row_factory = sqlite3.Row
    try:
        yield db
        db.commit()
    finally: db.close()
with database() as db:
    db.executescript('''
    create table if not exists users(email text primary key, display_name text not null, role text not null, password_hash text not null);
    create table if not exists assessments(id text primary key, doctor_email text not null, patient_id text, patient_json text not null, finding text, ai_result text, ecg_path text, created_at text not null);
    create table if not exists centers(id text primary key, owner text not null, data text not null);
    create table if not exists uploads(id text primary key, owner text not null, mime text not null);
    create table if not exists handovers(id text primary key, center_id text not null, owner text not null, data text not null, ecg_path text not null, created_at text not null);
    create table if not exists route_estimates(id text primary key, owner text, center_id text, data text, created_at text);
    create table if not exists revoked_tokens(id text primary key);
    ''')
    if 'deleted_at' not in {r['name'] for r in db.execute('pragma table_info(centers)')}:
        db.execute('alter table centers add column deleted_at text')
pwd = CryptContext(schemes=['pbkdf2_sha256','bcrypt'], deprecated='auto')
app = FastAPI(title='ЭКГ телеметрия API')
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins.split(','), allow_methods=['*'], allow_headers=['*'])
oauth = OAuth2PasswordBearer(tokenUrl='/auth/login')
@app.exception_handler(HTTPException)
async def http_error(request, exc): return JSONResponse({'error':str(exc.detail)},status_code=exc.status_code)
@app.exception_handler(RequestValidationError)
async def validation_error(request, exc): return JSONResponse({'error':'invalid_input'},status_code=422)
def now(): return datetime.now(timezone.utc).isoformat()
def profile(row): return {'id':row['email'],'email':row['email'],'displayName':row['display_name'],'role':row['role']}
def current(auth=Depends(oauth)):
    try:
        claims=jwt.decode(auth,settings.jwt_secret,algorithms=['HS256'])
        with database() as db:
            row=db.execute('select * from users where email=?',(claims['sub'],)).fetchone()
            revoked=db.execute('select 1 from revoked_tokens where id=?',(claims.get('jti',''),)).fetchone()
        if not row or revoked: raise ValueError()
        return {**profile(row),'jti':claims.get('jti','')}
    except (JWTError,KeyError,ValueError): raise HTTPException(401,'sign_in_required')
def role(user, expected):
    if user['role']!=expected: raise HTTPException(403,'forbidden')
def session(row):
    user=profile(row)
    token=jwt.encode({'sub':user['email'],'jti':str(uuid4()),'exp':datetime.now(timezone.utc)+timedelta(days=14)},settings.jwt_secret,algorithm='HS256')
    return {'user':user,'access_token':token,'token_type':'bearer'}
class Register(BaseModel):
    email: str = Field(min_length=3,max_length=254)
    password: str = Field(min_length=10,max_length=128)
    display_name: str = Field(min_length=1,max_length=120)
    role: Literal['doctor','manager']
@app.get('/health')
def health(): return {'status':'ok'}
@app.post('/auth/register')
def register(data:Register):
    email=data.email.strip().lower()
    if '@' not in email: raise HTTPException(422,'invalid_input')
    try:
        with database() as db:
            db.execute('insert into users values(?,?,?,?)',(email,data.display_name,data.role,pwd.hash(data.password)))
            return session(db.execute('select * from users where email=?',(email,)).fetchone())
    except sqlite3.IntegrityError: raise HTTPException(409,'email_exists')
@app.post('/auth/login')
def login(form:OAuth2PasswordRequestForm=Depends()):
    with database() as db: row=db.execute('select * from users where email=?',(form.username.lower().strip(),)).fetchone()
    if not row or not pwd.verify(form.password,row['password_hash']): raise HTTPException(401,'invalid_credentials')
    return session(row)
@app.get('/auth/me')
def me(user=Depends(current)): return {'user':{k:v for k,v in user.items() if k!='jti'}}
@app.post('/auth/logout')
def logout(user=Depends(current)):
    with database() as db: db.execute('insert or ignore into revoked_tokens values(?)',(user['jti'],))
    return {'ok':True}
class Center(BaseModel):
    name:str=Field(min_length=2,max_length=160)
    city:str=Field(min_length=2,max_length=100)
    address:str=Field(min_length=3,max_length=240)
    phone:str=Field(min_length=5,max_length=40)
    emergencyPhone:str=Field(min_length=5,max_length=40)
    latitude:str=''
    longitude:str=''
    @field_validator('latitude','longitude',mode='before')
    @classmethod
    def coordinate(cls,value,info):
        raw=str(value if value is not None else '').strip().replace(',','.')
        if not raw: return ''
        if not re.fullmatch(r'[+-]?(?:\d+(?:\.\d*)?|\.\d+)',raw): raise ValueError('invalid_coordinate')
        number=float(raw)
        limit=90 if info.field_name=='latitude' else 180
        if not -limit<=number<=limit: raise ValueError('invalid_coordinate')
        return str(number)
    @model_validator(mode='after')
    def coordinate_pair(self):
        if bool(self.latitude)!=bool(self.longitude): raise ValueError('coordinate_pair_required')
        return self
    pciAvailable:bool=True
    acceptingPatients:bool=False
    availabilityStatus:Literal['accepting','limited','unavailable']='unavailable'
def center_data(id,data,user):
    return {'id':id,'name':data.name,'city':data.city,'address':data.address,'phone':data.phone,'emergency_phone':data.emergencyPhone,'latitude':data.latitude,'longitude':data.longitude,'pci_available':data.pciAvailable,'availability_status':data.availabilityStatus,'accepting_patients':data.availabilityStatus=='accepting','manager_email':user['email'],'updated_at':now()}
@app.get('/centers')
def centers(mine:int=0,user=Depends(current)):
    with database() as db:
        rows=db.execute('select data from centers where deleted_at is null'+(' and owner=?' if mine else ''),(user['email'],) if mine else ()).fetchall()
    return {'centers':sorted([json.loads(r['data']) for r in rows],key=lambda c:({'accepting':0,'limited':1,'unavailable':2}[c['availability_status']],c['name']))}
@app.post('/centers')
def create_center(data:Center,user=Depends(current)):
    role(user,'manager'); id=str(uuid4()); c=center_data(id,data,user)
    with database() as db: db.execute('insert into centers(id,owner,data) values(?,?,?)',(id,user['email'],json.dumps(c)))
    return {'id':id,'center':c}
@app.put('/centers/{id}')
def update_center(id:str,data:Center,user=Depends(current)):
    role(user,'manager'); c=center_data(id,data,user)
    with database() as db:
        if not db.execute('update centers set data=? where id=? and owner=? and deleted_at is null',(json.dumps(c),id,user['email'])).rowcount: raise HTTPException(404,'center_not_found')
    return {'id':id,'center':c}
@app.get('/admin/centers')
def admin_centers(user=Depends(current)):
    role(user,'superadmin')
    with database() as db:
        rows=db.execute('select data from centers where deleted_at is null').fetchall()
    return {'centers':[json.loads(row['data']) for row in rows]}

@app.delete('/admin/centers/{id}')
def delete_center(id:str,user=Depends(current)):
    role(user,'superadmin')
    with database() as db:
        if not db.execute('update centers set deleted_at=? where id=? and deleted_at is null',(now(),id)).rowcount:
            raise HTTPException(404,'center_not_found')
    return {'ok':True}

async def save_image(image,user,limit=15*1024*1024):
    raw=await image.read(limit+1)
    if len(raw)>limit: raise HTTPException(413,'file_too_large')
    mime=image.content_type
    valid=(mime=='image/png' and raw.startswith(b'\x89PNG\r\n\x1a\n')) or (mime=='image/jpeg' and raw.startswith(b'\xff\xd8\xff')) or (mime=='image/webp' and raw[:4]==b'RIFF' and raw[8:12]==b'WEBP')
    if not valid: raise HTTPException(422,'invalid_image')
    key=str(uuid4()); (store/key).write_bytes(raw)
    with database() as db: db.execute('insert into uploads values(?,?,?)',(key,user['email'],mime))
    return key,raw,mime
def file_response(key,user,authorized=False):
    with database() as db: row=db.execute('select * from uploads where id=?',(key,)).fetchone()
    if not row or not (store/key).is_file() or (not authorized and row['owner']!=user['email']): raise HTTPException(404,'not_found')
    return FileResponse(store/key,media_type=row['mime'],headers={'Cache-Control':'no-store'})
@app.post('/ecg/upload')
async def upload(image:UploadFile=File(...),user=Depends(current)):
    role(user,'doctor'); key,_,_=await save_image(image,user); return {'object_key':key}
@app.get('/ecg/files/{key}')
def ecg_file(key:str,user=Depends(current)): return file_response(key,user)
class Assessment(BaseModel):
    id:str|None=None
    patient_id:str=''
    patient:dict
    finding:str=''
    ai_result:dict|None=None
    ecg_path:str|None=None
@app.post('/assessments')
def save_assessment(data:Assessment,user=Depends(current)):
    role(user,'doctor'); id=data.id or str(uuid4())
    with database() as db:
        old=db.execute('select doctor_email from assessments where id=?',(id,)).fetchone()
        if old and old['doctor_email']!=user['email']: raise HTTPException(404,'not_found')
        if data.ecg_path and not db.execute('select 1 from uploads where id=? and owner=?',(data.ecg_path,user['email'])).fetchone(): raise HTTPException(404,'not_found')
        db.execute('insert into assessments values(?,?,?,?,?,?,?,?) on conflict(id) do update set patient_id=excluded.patient_id,patient_json=excluded.patient_json,finding=excluded.finding,ai_result=excluded.ai_result,ecg_path=excluded.ecg_path',(id,user['email'],data.patient_id,json.dumps(data.patient),data.finding,json.dumps(data.ai_result) if data.ai_result else None,data.ecg_path,now()))
    return {'id':id}
@app.get('/assessments')
def assessments(user=Depends(current)):
    role(user,'doctor')
    with database() as db: rows=db.execute('select * from assessments where doctor_email=? order by created_at desc',(user['email'],)).fetchall()
    return {'assessments':[{**dict(r),'patient':json.loads(r['patient_json']),'ai_result':json.loads(r['ai_result']) if r['ai_result'] else None} for r in rows]}
from .routing import Origin, destination, estimate

@app.post('/centers/{id}/route')
async def center_route(id:str, origin:Origin, user=Depends(current)):
    role(user,'doctor')
    with database() as db:
        row=db.execute('select data from centers where id=? and deleted_at is null',(id,)).fetchone()
    if not row: raise HTTPException(404,'center_not_found')
    target=destination(json.loads(row['data']))
    route=await estimate(settings.routing_base_url,origin,target)
    created=now(); quote_id=str(uuid4())
    route.update({'id':quote_id,'center_id':id,'destination':target.model_dump(),'calculated_at':created})
    with database() as db:
        db.execute('delete from route_estimates where created_at<?',((datetime.now(timezone.utc)-timedelta(hours=1)).isoformat(),))
        db.execute('insert into route_estimates values(?,?,?,?,?)',(quote_id,user['email'],id,json.dumps(route),created))
    return {'route':route}

@app.post('/handovers')
async def handover(context:str=Form(...),image:UploadFile=File(...),user=Depends(current)):
    role(user,'doctor')
    try: data=json.loads(context)
    except ValueError: raise HTTPException(422,'invalid_input')
    if not isinstance(data,dict) or data.get('transferConsent') is not True or not isinstance(data.get('patient'),dict): raise HTTPException(422,'invalid_input')
    id=str(uuid4())
    with database() as db:
        center=db.execute('select data from centers where id=? and deleted_at is null',(data.get('centerId'),)).fetchone()
        if not center: raise HTTPException(404,'center_not_found')
        if json.loads(center['data'])['availability_status']=='unavailable': raise HTTPException(409,'center_not_accepting')
    # Accept only a fresh, server-computed estimate belonging to this sender and center.
    data.pop('transport',None)
    quote_id=data.pop('routeEstimateId',None)
    if quote_id:
        with database() as db:
            quote=db.execute('select * from route_estimates where id=? and owner=? and center_id=?',(quote_id,user['email'],data['centerId'])).fetchone()
        if not quote: raise HTTPException(422,'route_estimate_invalid')
        if datetime.now(timezone.utc)-datetime.fromisoformat(quote['created_at'])>timedelta(minutes=10): raise HTTPException(409,'route_estimate_expired')
        route=json.loads(quote['data'])
        if route['destination']!=destination(json.loads(center['data'])).model_dump(): raise HTTPException(409,'route_estimate_expired')
        departure=datetime.now(timezone.utc)
        data['transport']={**route,'departure_at':departure.isoformat(),
            'expected_arrival_at':(departure+timedelta(seconds=route['duration_seconds'])).isoformat()}
    key,_,_=await save_image(image,user)
    with database() as db: db.execute('insert into handovers values(?,?,?,?,?,?)',(id,data['centerId'],user['email'],json.dumps(data),key,now()))
    return {'handoverId':id}
def incoming_rows(user, center_id=None):
    # Author and timestamps come from persisted server records, not client context.
    query = """select h.*, u.display_name as creator_name, c.data as center_data
        from handovers h join centers c on h.center_id=c.id
        left join users u on h.owner=u.email where c.owner=?"""
    params = [user['email']]
    if center_id is not None:
        query += ' and c.id=?'
        params.append(center_id)
    with database() as db:
        rows = db.execute(query+' order by h.created_at desc', params).fetchall()
    return {'handovers':[{
        'id':r['id'], 'center_id':r['center_id'],
        'center_name':json.loads(r['center_data']).get('name',''),
        'patient':json.loads(r['data']), 'created_at':r['created_at'],
        'created_by':{'email':r['owner'], 'display_name':r['creator_name'] or r['owner']},
        'clinician_email':r['owner'], 'status':'new'
    } for r in rows]}

@app.get('/handovers')
def manager_handovers(user=Depends(current)):
    role(user,'manager')
    return incoming_rows(user)

@app.get('/centers/{id}/handovers')
def incoming(id:str,user=Depends(current)):
    role(user,'manager')
    with database() as db:
        if not db.execute('select 1 from centers where id=? and owner=?',(id,user['email'])).fetchone(): raise HTTPException(404,'center_not_found')
    return incoming_rows(user,id)
@app.get('/handovers/{id}/ecg')
def handover_ecg(id:str,user=Depends(current)):
    with database() as db: row=db.execute('select h.* from handovers h join centers c on h.center_id=c.id where h.id=? and (h.owner=? or c.owner=?)',(id,user['email'],user['email'])).fetchone()
    if not row: raise HTTPException(404,'not_found')
    return file_response(row['ecg_path'],user,True)

@app.get('/ecg/status')
def ecg_status(user=Depends(current)): return {'configured':bool(settings.openai_api_key),'signed_in':True}
from .ecg import Analysis, Context, guardrails
def provider_error(exc):
    # Never log provider messages, request bodies, images, patient details or keys.
    def safe(value):
        return re.sub(r'[^a-zA-Z0-9_.:-]', '_', str(value or 'unknown'))[:100]
    logger.warning('analysis_provider_error type=%s status=%s code=%s param=%s request_id=%s',
        type(exc).__name__, getattr(exc,'status_code',None), safe(getattr(exc,'code',None)),
        safe(getattr(exc,'param',None)), safe(getattr(exc,'request_id',None)))
    if isinstance(exc, AuthenticationError): return HTTPException(503,'provider_configuration')
    if isinstance(exc, RateLimitError):
        return HTTPException(503,'provider_quota') if getattr(exc,'code',None)=='insufficient_quota' else HTTPException(429,'rate_limited')
    if isinstance(exc, APITimeoutError): return HTTPException(504,'timeout')
    if isinstance(exc, APIConnectionError): return HTTPException(502,'provider_connection')
    if isinstance(exc, APIStatusError):
        if exc.status_code in (401,403,404): return HTTPException(503,'provider_configuration')
        if exc.status_code in (400,422):
            if getattr(exc,'code',None) in ('invalid_image','invalid_image_format','image_parse_error'):
                return HTTPException(422,'invalid_image')
            return HTTPException(502,'provider_request_rejected')
    return HTTPException(502,'provider_unavailable')

@app.post('/ecg/analyze')
async def analyze(context:str=Form(...),image:UploadFile=File(...),patient_name:str=Form('',max_length=200),user=Depends(current)):
    role(user,'doctor')
    try: ctx=Context.model_validate_json(context)
    except ValidationError: raise HTTPException(422,'invalid_input')
    if not settings.openai_api_key: raise HTTPException(503,'not_configured')
    key,raw,mime=await save_image(image,user,5*1024*1024)
    try:
        async with AsyncOpenAI(api_key=settings.openai_api_key,timeout=85,max_retries=0) as client:
            result=await client.beta.chat.completions.parse(model=settings.openai_model,response_format=Analysis,messages=[{'role':'system','content':(ROOT/'app/ecg-prompt.txt').read_text()},{'role':'user','content':[{'type':'text','text':ctx.model_dump_json()},{'type':'image_url','image_url':{'url':f'data:{mime};base64,{base64.b64encode(raw).decode()}'}}]}])
        message=result.choices[0].message
        if message.refusal: raise HTTPException(422,'model_refusal')
        if not message.parsed: raise HTTPException(502,'invalid_response')
        model_coronary_state=message.parsed.coronary_state
        analysis,guards=guardrails(message.parsed,ctx)
        envelope={'analysis':analysis.model_dump(),'model':settings.openai_model,'prompt_version':'pulsepoint-ecg-1.2.0','model_coronary_state':model_coronary_state,'analyzed_at':now(),'guardrails':guards,'ecg_path':key}
        saved=save_assessment(Assessment(patient_id=patient_name.strip(),patient=ctx.patient.model_dump(),ai_result=envelope,ecg_path=key),user)
        return {**envelope,'assessment_id':saved['id']}
    except (ValidationError,ValueError): raise HTTPException(502,'invalid_response')
    except APIError as exc: raise provider_error(exc) from None



# Registered after API routes: the production frontend shares the API origin.
if settings.frontend_dist:
    from fastapi.staticfiles import StaticFiles
    app.mount('/', StaticFiles(directory=settings.frontend_dist, html=True), name='frontend')
