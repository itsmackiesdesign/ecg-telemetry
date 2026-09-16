from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator
class Strict(BaseModel):
    model_config=ConfigDict(extra='forbid')
class Quality(Strict):
    status:Literal['adequate','limited','uninterpretable']
    readable_leads:list[str]
    missing_or_unreadable_leads:list[str]
    calibration_visible:bool
    limitations:list[str]
class Measurement(Strict):
    name:str
    value:float|None
    unit:str|None
    source:Literal['visual_estimate','device_printout','supplied_data']
    approximate:bool
    limitation:str|None
class Finding(Strict):
    finding:str
    leads:list[str]
    supporting_observation:str
class Interpretation(Strict):
    interpretation:str
    supporting_findings:list[str]
    limitations:list[str]
class Step(Strict):
    action:str
    reason:str
    urgency:Literal['immediate','urgent','routine']
class Analysis(Strict):
    coronary_state:Literal['stemi_omi','ischemia_risk','low_risk']|None
    analysis_status:Literal['completed','limited','unable_to_interpret']
    image_quality:Quality
    measurements:list[Measurement]
    observed_findings:list[Finding]
    preliminary_interpretations:list[Interpretation]
    review_priority:Literal['emergency_review','urgent_review','no_acute_ecg_features_identified','indeterminate']
    priority_reason:str
    next_steps:list[Step]
    missing_information:list[str]
    summary_for_clinician:str
    requires_physician_confirmation:Literal[True]
    acs_ruled_out:Literal[False]
class Patient(Strict):
    age:int=Field(ge=18,le=120)
    sex:Literal['male','female']
    symptom_onset:str|None
    systolic:float=Field(ge=40,le=300)
    diastolic:float=Field(ge=20,le=200)
    pulse:float=Field(ge=20,le=300)
    spo2:float=Field(ge=30,le=100)
    symptoms:list[Literal['chest','breath','sweat','nausea','radiating','dizzy']]
    notes:str=Field(max_length=4000)
    @model_validator(mode='after')
    def pressure(self):
        if self.diastolic>self.systolic: raise ValueError('blood_pressure')
        return self
class Context(Strict):
    language:Literal['en','ru','uz']
    patient:Patient
    consent:Literal[True]
def guardrails(a,c):
    guards=[]; q=a.image_quality; p=c.patient
    if q.status=='uninterpretable' or a.analysis_status=='unable_to_interpret':
        q.status='uninterpretable'; a.analysis_status='unable_to_interpret'
        if a.review_priority not in ['emergency_review','urgent_review']: a.review_priority='indeterminate'; guards.append('uninterpretable')
    elif q.status=='limited' or a.analysis_status=='limited':
        a.analysis_status='limited'
        if a.review_priority=='no_acute_ecg_features_identified': a.review_priority='indeterminate'; guards.append('limited')
    expected={'i','ii','iii','avr','avl','avf','v1','v2','v3','v4','v5','v6'}
    if a.review_priority=='no_acute_ecg_features_identified' and (not expected.issubset({v.lower().strip() for v in q.readable_leads}) or q.missing_or_unreadable_leads or not q.calibration_visible):
        a.review_priority='indeterminate'; guards.append('incomplete_recording')
    if not q.calibration_visible:
        for m in a.measurements:
            if m.source=='visual_estimate' and m.value is not None: m.value=None; guards.append('unverified_measurement')
    if p.symptoms and a.review_priority=='no_acute_ecg_features_identified': a.review_priority='urgent_review'; guards.append('symptoms_require_review')
    if p.systolic<90 or p.spo2<90 or p.pulse<40 or p.pulse>150:
        a.review_priority='emergency_review'; guards.append('abnormal_vitals')
    if a.coronary_state=='stemi_omi':
        a.review_priority='emergency_review'
    if a.coronary_state=='ischemia_risk' and a.review_priority=='no_acute_ecg_features_identified':
        a.review_priority='urgent_review'
    if a.coronary_state=='low_risk' and (a.review_priority!='no_acute_ecg_features_identified' or a.analysis_status!='completed' or q.status!='adequate' or p.symptoms):
        # Safety rules can withhold reassurance, but cannot invent ischemia.
        a.coronary_state=None; guards.append('low_risk_not_supported')
    if q.status=='uninterpretable':
        a.coronary_state=None; guards.append('uninterpretable')
    return a,list(dict.fromkeys(guards))
