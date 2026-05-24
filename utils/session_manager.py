import uuid
import time
from collections import defaultdict

class SessionManager:
    def __init__(self):
        self._sessions = {}
        self._ttl = 3600

    def create_session(self):
        sid = str(uuid.uuid4())
        self._sessions[sid] = {
            'created': time.time(),
            'last_active': time.time(),
            'analyses': []
        }
        return sid

    def _get(self, sid):
        s = self._sessions.get(sid)
        if s:
            s['last_active'] = time.time()
        return s

    def add_analysis(self, sid, result):
        if sid not in self._sessions:
            self.create_session()
            self._sessions[sid] = {'created': time.time(), 'last_active': time.time(), 'analyses': []}
        s = self._sessions[sid]
        s['last_active'] = time.time()
        s['analyses'].append(result)

    def get_analytics(self, sid):
        s = self._get(sid)
        if not s or not s['analyses']:
            return {
                'total_analyses': 0,
                'average_exploitability': 0,
                'top_triggers': [],
                'attack_categories': {},
                'risk_distribution': {'low': 0, 'medium': 0, 'high': 0, 'critical': 0}
            }
        
        analyses = [a for a in s['analyses'] if 'error' not in a]
        if not analyses:
            return {'total_analyses': 0, 'average_exploitability': 0, 'top_triggers': [], 'attack_categories': {}, 'risk_distribution': {}}

        trigger_counts = defaultdict(int)
        cat_counts = defaultdict(int)
        risk_counts = defaultdict(int)
        total_score = 0

        for a in analyses:
            total_score += a.get('exploitability_score', 0)
            for t in a.get('psychological_triggers', []):
                trigger_counts[t] += 1
            cat = a.get('attack_category', 'unknown')
            cat_counts[cat] += 1
            risk = a.get('risk_level', 'medium')
            risk_counts[risk] += 1

        top_triggers = sorted(trigger_counts.items(), key=lambda x: x[1], reverse=True)

        return {
            'total_analyses': len(analyses),
            'average_exploitability': round(total_score / len(analyses)),
            'top_triggers': [{'trigger': t, 'count': c} for t, c in top_triggers[:5]],
            'attack_categories': dict(cat_counts),
            'risk_distribution': {
                'low': risk_counts.get('low', 0),
                'medium': risk_counts.get('medium', 0),
                'high': risk_counts.get('high', 0),
                'critical': risk_counts.get('critical', 0)
            }
        }

    def cleanup_old_sessions(self):
        now = time.time()
        stale = [sid for sid, s in self._sessions.items() if now - s['last_active'] > self._ttl]
        for sid in stale:
            del self._sessions[sid]
