import os,tempfile,unittest,json
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
  context['consent']=False
  self.assertEqual(client.post('/ecg/analyze',headers=doctor,data={'context':json.dumps(context)},files={'image':('ecg.png',PNG,'image/png')}).status_code,422)
if __name__=='__main__':unittest.main()
