import unittest
from app.ecg import Analysis,Context,guardrails
class States(unittest.TestCase):
 def test_states_and_quality(self):
  ctx=Context(language='ru',consent=True,patient=dict(age=50,sex='male',symptom_onset=None,systolic=120,diastolic=80,pulse=70,spo2=98,symptoms=[],notes=''))
  base=dict(coronary_state='low_risk',analysis_status='completed',image_quality=dict(status='adequate',readable_leads=['I','II','III','aVR','aVL','aVF','V1','V2','V3','V4','V5','V6'],missing_or_unreadable_leads=[],calibration_visible=True,limitations=[]),measurements=[],observed_findings=[],preliminary_interpretations=[],review_priority='no_acute_ecg_features_identified',priority_reason='test',next_steps=[],missing_information=[],summary_for_clinician='test',requires_physician_confirmation=True,acs_ruled_out=False)
  a,_=guardrails(Analysis(**base),ctx);self.assertEqual(a.coronary_state,'low_risk')
  for state in ['stemi_omi','ischemia_risk']:
   a,_=guardrails(Analysis(**{**base,'coronary_state':state}),ctx)
   self.assertEqual(a.review_priority,'emergency_review' if state=='stemi_omi' else 'urgent_review')
  a=Analysis(**base);a.image_quality.status='limited';a,_=guardrails(a,ctx);self.assertIsNone(a.coronary_state)
  a=Analysis(**base);a.image_quality.status='uninterpretable';a,_=guardrails(a,ctx);self.assertIsNone(a.coronary_state)
  ctx.patient.systolic=80;a,_=guardrails(Analysis(**base),ctx);self.assertEqual(a.review_priority,'emergency_review');self.assertNotEqual(a.coronary_state,'stemi_omi');self.assertIsNone(a.coronary_state)
