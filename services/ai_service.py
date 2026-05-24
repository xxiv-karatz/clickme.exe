import os
import json
import time
import requests

API_KEY = os.getenv('DEEPSEEK_API_KEY', '')
API_URL = 'https://api.deepseek.com/chat/completions'

SYSTEM_PROMPT = """You are an expert cybersecurity analyst specializing in social engineering forensics and behavioral psychology. Your task is to analyze potentially malicious messages and return a structured forensic report.

Analyze the provided message and return ONLY a valid JSON object with NO additional text, markdown, or explanation. The JSON must match this exact schema:

{
  "psychological_triggers": ["urgency", "fear"],
  "technical_indicators": ["spoofed_domain", "urgency_language"],
  "narrative_summary": "A 2-3 sentence explanation of the attack narrative and why it is effective...",
  "exploitability_score": 85,
  "defense_for_user": "Specific actionable advice for an end-user recipient...",
  "defense_for_it": "Specific technical controls and SOC recommendations...",
  "confidence_score": 92,
  "mitre_attack_mapping": ["T1566.001"],
  "risk_level": "high",
  "attack_category": "credential_phishing"
}

Rules:
- psychological_triggers: array of strings from [urgency, fear, authority, scarcity, reciprocity, familiarity, greed, curiosity, intimidation, compliance_pressure]
- technical_indicators: array of specific red flags observed
- narrative_summary: 2-3 sentences explaining the attack psychology
- exploitability_score: integer 0-100 (likelihood an average person would fall for it)
- defense_for_user: 2-3 concrete steps for the recipient
- defense_for_it: 2-3 technical controls for security teams
- confidence_score: integer 0-100 (your confidence in this analysis)
- mitre_attack_mapping: relevant MITRE ATT&CK technique IDs
- risk_level: one of "low", "medium", "high", "critical"
- attack_category: one of "ceo_fraud", "credential_phishing", "invoice_scam", "package_scam", "job_scam", "mfa_bypass", "crypto_scam", "general_phishing", "smishing", "vishing_script", "legitimate"

Return ONLY the JSON. No preamble, no explanation, no markdown backticks."""

def call_api(message_text, retries=2):
    if not API_KEY:
        return None, 'DEEPSEEK_API_KEY not set in environment'
    
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {API_KEY}'
    }
    payload = {
        'model': 'deepseek-chat',
        'max_tokens': 1024,
        'messages': [
            {'role': 'system', 'content': SYSTEM_PROMPT},
            {'role': 'user', 'content': f'Analyze this message for social engineering indicators:\n\n{message_text}'}
        ]
    }
    
    for attempt in range(retries + 1):
        try:
            resp = requests.post(API_URL, headers=headers, json=payload, timeout=30)
            if resp.status_code == 200:
                data = resp.json()
                text = data['choices'][0]['message']['content'].strip()
                if text.startswith('```'):
                    text = text.split('```')[1]
                    if text.startswith('json'):
                        text = text[4:]
                return json.loads(text), None
            elif resp.status_code == 429 and attempt < retries:
                time.sleep(2 ** attempt)
            else:
                return None, f'API error {resp.status_code}: {resp.text[:200]}'
        except json.JSONDecodeError as e:
            return None, f'JSON parse error: {str(e)}'
        except requests.exceptions.Timeout:
            if attempt < retries:
                time.sleep(1)
            else:
                return None, 'Request timed out after 30s'
        except Exception as e:
            return None, str(e)
    
    return None, 'Max retries exceeded'

def validate_result(result):
    required = ['psychological_triggers', 'technical_indicators', 'narrative_summary',
                 'exploitability_score', 'defense_for_user', 'defense_for_it',
                 'confidence_score', 'mitre_attack_mapping', 'risk_level', 'attack_category']
    for field in required:
        if field not in result:
            result[field] = [] if field in ['psychological_triggers', 'technical_indicators', 'mitre_attack_mapping'] else \
                            0 if field in ['exploitability_score', 'confidence_score'] else \
                            'unknown' if field in ['risk_level', 'attack_category'] else ''
    result['exploitability_score'] = max(0, min(100, int(result.get('exploitability_score', 0))))
    result['confidence_score'] = max(0, min(100, int(result.get('confidence_score', 0))))
    if result['risk_level'] not in ['low', 'medium', 'high', 'critical']:
        result['risk_level'] = 'medium'
    return result

def analyze_message(message_text):
    result, error = call_api(message_text)
    if error:
        return {'error': error}
    return validate_result(result)

def analyze_batch(messages):
    results = []
    for msg in messages:
        result = analyze_message(msg)
        result['original_message'] = msg[:120] + ('...' if len(msg) > 120 else '')
        results.append(result)
        time.sleep(0.5)
    return results
