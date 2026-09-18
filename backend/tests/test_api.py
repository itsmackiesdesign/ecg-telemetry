import os,tempfile,unittest,json
import httpx
from openai import BadRequestError, PermissionDeniedError, NotFoundError, RateLimitError, InternalServerError, APIConnectionError, APITimeoutError
from unittest.mock import patch,AsyncMock
from types import SimpleNamespace
TMP=tempfile.TemporaryDirectory()
os.environ['DATABASE_PATH']=TMP.name+'/test.db'
os.environ['ECG_STORAGE_DIR']=TMP.name+'/files'
os.environ['JWT_SECRET']='test-only-secret-which-is-not-for-production'
from fastapi.testclient import TestClient
from app.main import app,settings
from app.ecg import Analysis
client=TestClient(app)
PNG=b'\x89PNG\r\n\x1a\n'+b'testdata'
class Workflow(unittest.TestCase):
 def account(self,email,role):
  r=client.post('/auth/register',json={'email':email,'password':'TestPassword2026!','display_name':email,'role':role});self.assertEqual(r.status_code,200,r.text)
  return {'Authorization':'Bearer '+r.json()['access_token']}
 def test_workflow(self):
  doctor=self.account('doctor@example.com','doctor');other=self.account('other@example.com','doctor');manager=self.account('manager@example.com','manager');stranger=self.account('stranger@example.com','manager')
  self.assertEqual(client.get('/auth/me',headers=doctor).json()['user']['displayName'],'doctor@example.com')
  data={'name':'Test Center','city':'Tashkent','address':'Test street','phone':'1234567','emergencyPhone':'1234567','availabilityStatus':'accepting'}
  r=client.post('/centers',headers=manager,json=data);self.assertEqual(r.status_code,200,r.text);id=r.json()['id']
  self.assertEqual(client.post('/centers',headers=doctor,json=data).status_code,403)
  self.assertEqual(client.put('/centers/'+id,headers=stranger,json=data).status_code,404)
  key=client.post('/ecg/upload',headers=doctor,files={'image':('ecg.png',PNG,'image/png')}).json()['object_key']
  self.assertEqual(client.get('/ecg/files/'+key,headers=other).status_code,404)
  a=client.post('/assessments',headers=doctor,json={'patient':{'age':58},'ecg_path':key}).json()['id']
  self.assertEqual(len(client.get('/assessments',headers=doctor).json()['assessments']),1)
  self.assertEqual(client.get('/assessments',headers=other).json()['assessments'],[])
  self.assertEqual(client.get('/assessments',headers=manager).status_code,403)
  self.assertEqual(client.post('/assessments',headers=other,json={'id':a,'patient':{}}).status_code,404)
  context={'centerId':id,'transferConsent':True,'patient':{'age':58}}
  r=client.post('/handovers',headers=doctor,data={'context':json.dumps(context)},files={'image':('ecg.png',PNG,'image/png')});self.assertEqual(r.status_code,200,r.text);hid=r.json()['handoverId']
  self.assertEqual(len(client.get('/centers/'+id+'/handovers',headers=manager).json()['handovers']),1)
  feed=client.get('/handovers',headers=manager)
  self.assertEqual(feed.status_code,200)
  item=feed.json()['handovers'][0]
  self.assertEqual(item['id'],hid)
  self.assertEqual(item['center_name'],'Test Center')
  self.assertEqual(item['created_by'],{'email':'doctor@example.com','display_name':'doctor@example.com'})
  self.assertTrue(item['created_at'])
  self.assertEqual(client.get('/handovers',headers=stranger).json()['handovers'],[])
  self.assertEqual(client.get('/handovers',headers=doctor).status_code,403)
  self.assertEqual(client.get('/handovers').status_code,401)
  image=client.get('/handovers/'+hid+'/ecg',headers=manager)
  self.assertEqual(image.status_code,200)
  self.assertEqual(image.content,PNG)
  self.assertEqual(image.headers['content-type'],'image/png')
  self.assertEqual(client.get('/handovers/'+hid+'/ecg').status_code,401)
  self.assertEqual(client.get('/handovers/'+hid+'/ecg',headers=stranger).status_code,404)
  data['availabilityStatus']='unavailable';client.put('/centers/'+id,headers=manager,json=data)
  self.assertEqual(client.post('/handovers',headers=doctor,data={'context':json.dumps(context)},files={'image':('ecg.png',PNG,'image/png')}).status_code,409)
  client.post('/auth/logout',headers=doctor);self.assertEqual(client.get('/auth/me',headers=doctor).status_code,401)
 def test_analysis_contract(self):
  doctor=self.account('analysis@example.com','doctor')
  context={'language':'ru','consent':True,'patient':{'age':58,'sex':'male','symptom_onset':None,'systolic':80,'diastolic':60,'pulse':90,'spo2':95,'symptoms':['chest'],'notes':''}}
  analysis=Analysis(coronary_state='low_risk',analysis_status='limited',image_quality={'status':'limited','readable_leads':[],'missing_or_unreadable_leads':[],'calibration_visible':False,'limitations':['test']},measurements=[],observed_findings=[],preliminary_interpretations=[],review_priority='indeterminate',priority_reason='test',next_steps=[],missing_information=[],summary_for_clinician='test',requires_physician_confirmation=True,acs_ruled_out=False)
  mock=AsyncMock();mock.__aenter__.return_value=mock;mock.beta.chat.completions.parse.return_value=SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(refusal=None,parsed=analysis))])
  with patch('app.main.AsyncOpenAI',return_value=mock),patch.object(settings,'openai_api_key','test-key'):
   r=client.post('/ecg/analyze',headers=doctor,data={'context':json.dumps(context),'patient_name':'Test Patient Name'},files={'image':('ecg.png',PNG,'image/png')})
  self.assertEqual(r.status_code,200,r.text);self.assertEqual(r.json()['analysis']['review_priority'],'emergency_review');self.assertIn('assessment_id',r.json())
  self.assertEqual(client.get('/assessments',headers=doctor).json()['assessments'][0]['patient_id'],'Test Patient Name')
  self.assertNotIn('Test Patient Name',str(mock.beta.chat.completions.parse.call_args))
  self.assertNotIn('reasoning_effort',mock.beta.chat.completions.parse.call_args.kwargs)
  context['consent']=False
  self.assertEqual(client.post('/ecg/analyze',headers=doctor,data={'context':json.dumps(context)},files={'image':('ecg.png',PNG,'image/png')}).status_code,422)
 def test_center_coordinates(self):
  manager=self.account('coordinates@example.com','manager')
  data={'name':'Coordinate test','city':'Bukhara','address':'Test street','phone':'1234567','emergencyPhone':'1234567','latitude':' 39,7747 ','longitude':64.4286}
  r=client.post('/centers',headers=manager,json=data)
  self.assertEqual(r.status_code,200,r.text)
  center=r.json()['center']
  self.assertEqual(center['latitude'],'39.7747')
  self.assertEqual(center['longitude'],'64.4286')
  for lat,lon in [('91','64'),('39','181'),('39',''),('nan','64'),('39','bad')]:
   r=client.put('/centers/'+center['id'],headers=manager,json={**data,'latitude':lat,'longitude':lon})
   self.assertEqual(r.status_code,422,r.text)
  saved=client.get('/centers?mine=1',headers=manager).json()['centers'][0]
  self.assertEqual(saved['latitude'],'39.7747')
  self.assertEqual(saved['longitude'],'64.4286')
 def test_route_handover(self):
  from datetime import datetime,timezone,timedelta
  from app.main import database
  doctor=self.account('route-doctor@example.com','doctor');other=self.account('route-other@example.com','doctor');manager=self.account('route-manager@example.com','manager')
  data={'name':'Route Center','city':'Bukhara','address':'Test street','phone':'1234567','emergencyPhone':'1234567','latitude':'39.77','longitude':'64.42','availabilityStatus':'accepting'}
  cid=client.post('/centers',headers=manager,json=data).json()['id']
  origin={'latitude':39.8,'longitude':64.5}
  self.assertEqual(client.post('/centers/'+cid+'/route',headers=manager,json=origin).status_code,403)
  self.assertEqual(client.post('/centers/'+cid+'/route',headers=doctor,json={'latitude':100,'longitude':64}).status_code,422)
  with patch('app.main.estimate',new=AsyncMock(return_value={'duration_seconds':600,'distance_meters':4500,'provider':'OSRM','traffic_included':False})):
   r=client.post('/centers/'+cid+'/route',headers=doctor,json=origin)
  self.assertEqual(r.status_code,200,r.text);quote=r.json()['route']
  context={'centerId':cid,'transferConsent':True,'patient':{},'routeEstimateId':quote['id'],'transport':{'duration_seconds':1}}
  def send(headers):return client.post('/handovers',headers=headers,data={'context':json.dumps(context)},files={'image':('ecg.png',PNG,'image/png')})
  self.assertEqual(send(other).status_code,422)
  r=send(doctor);self.assertEqual(r.status_code,200,r.text)
  transport=client.get('/handovers',headers=manager).json()['handovers'][0]['patient']['transport']
  self.assertEqual(transport['duration_seconds'],600)
  arrival=datetime.fromisoformat(transport['expected_arrival_at']);departure=datetime.fromisoformat(transport['departure_at'])
  self.assertEqual((arrival-departure).total_seconds(),600)
  with database() as db:db.execute('update route_estimates set created_at=? where id=?',((datetime.now(timezone.utc)-timedelta(minutes=11)).isoformat(),quote['id']))
  self.assertEqual(send(doctor).status_code,409)
  del context['routeEstimateId']
  r=send(doctor);self.assertEqual(r.status_code,200,r.text)
  latest=client.get('/handovers',headers=manager).json()['handovers'][0]
  self.assertNotIn('transport',latest['patient'])

 def test_routing_provider(self):
  import asyncio
  from app.routing import estimate,Origin
  origin=Origin(latitude=39.8,longitude=64.5);target=Origin(latitude=39.77,longitude=64.42)
  mock=AsyncMock();mock.__aenter__.return_value=mock
  mock.get.return_value=httpx.Response(200,json={'code':'Ok','routes':[{'duration':600.2,'distance':4500}]},request=httpx.Request('GET','https://routing.test'))
  with patch('app.routing.httpx.AsyncClient',return_value=mock):
   result=asyncio.run(estimate('https://routing.test',origin,target))
  self.assertEqual(result['duration_seconds'],601)
  self.assertIn('64.5,39.8;64.42,39.77',mock.get.call_args.args[0])
  mock.get.return_value=httpx.Response(200,json={'code':'NoRoute'},request=httpx.Request('GET','https://routing.test'))
  from fastapi import HTTPException
  with patch('app.routing.httpx.AsyncClient',return_value=mock),self.assertRaises(HTTPException) as error:
   asyncio.run(estimate('https://routing.test',origin,target))
  self.assertEqual(error.exception.detail,'route_not_found')
 def test_provider_errors(self):
  doctor=self.account('errors@example.com','doctor')
  context={'language':'ru','consent':True,'patient':{'age':58,'sex':'male','symptom_onset':None,'systolic':120,'diastolic':80,'pulse':90,'spo2':95,'symptoms':[],'notes':'private note'}}
  request=httpx.Request('POST','https://api.openai.com/v1/chat/completions')
  cases=[]
  for cls,status,code,expected,http_status in [
   (BadRequestError,400,'unsupported_parameter','provider_request_rejected',502),
   (BadRequestError,400,'invalid_image','invalid_image',422),
   (PermissionDeniedError,403,'access_denied','provider_configuration',503),
   (NotFoundError,404,'model_not_found','provider_configuration',503),
   (RateLimitError,429,'insufficient_quota','provider_quota',503),
   (RateLimitError,429,'rate_limit_exceeded','rate_limited',429),
   (InternalServerError,500,'server_error','provider_unavailable',502),
  ]:
   cases.append((cls('private provider message',response=httpx.Response(status,request=request),body={'code':code,'param':'model'}),expected,http_status))
  cases.extend([(APIConnectionError(request=request),'provider_connection',502),(APITimeoutError(request=request),'timeout',504)])
  for exc,expected,status in cases:
   with self.subTest(expected=expected):
    mock=AsyncMock();mock.__aenter__.return_value=mock;mock.beta.chat.completions.parse.side_effect=exc
    with patch('app.main.AsyncOpenAI',return_value=mock),patch.object(settings,'openai_api_key','private-key'),self.assertLogs('ecg.analysis',level='WARNING') as logs:
     r=client.post('/ecg/analyze',headers=doctor,data={'context':json.dumps(context)},files={'image':('ecg.png',PNG,'image/png')})
    self.assertEqual(r.status_code,status,r.text)
    self.assertEqual(r.json(),{'error':expected})
    self.assertNotIn('private',str(logs.output))
  self.assertEqual(client.get('/assessments',headers=doctor).json()['assessments'],[])
if __name__=='__main__':unittest.main()
