import os
import threading
import time
import concurrent.futures
from flask import Flask, request, jsonify, render_template, session
from services.ai_service import analyze_message, analyze_batch
from utils.session_manager import SessionManager

# Configure Flask to use templates and static folders
app = Flask(__name__, template_folder='templates', static_folder='static')
app.secret_key = os.environ.get('SECRET_KEY', 'fallback-dev-key-change-this')
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

# Create temp folders if they don't exist
for folder in ['temp/uploads', 'temp/exports']:
    os.makedirs(folder, exist_ok=True)

session_manager = SessionManager()

def cleanup_worker():
    while True:
        time.sleep(1800)
        session_manager.cleanup_old_sessions()
        for folder in ['temp/uploads', 'temp/exports']:
            if not os.path.exists(folder):
                continue
            for f in os.listdir(folder):
                fp = os.path.join(folder, f)
                if os.path.isfile(fp) and time.time() - os.path.getmtime(fp) > 3600:
                    os.remove(fp)

cleanup_thread = threading.Thread(target=cleanup_worker, daemon=True)
cleanup_thread.start()

@app.route('/')
def landing():
    return render_template('landing.html')

@app.route('/app')
def workspace():
    return render_template('app.html')

@app.route('/api/session-init', methods=['GET'])
def session_init():
    sid = session_manager.create_session()
    return jsonify({'session_id': sid})

@app.route('/api/analyze', methods=['POST'])
def analyze():
    data = request.get_json()
    if not data or 'message_text' not in data or 'session_id' not in data:
        return jsonify({'error': 'Missing message_text or session_id'}), 400
    msg = data['message_text'].strip()
    if not msg:
        return jsonify({'error': 'Empty message'}), 400
    if len(msg) > 10000:
        return jsonify({'error': 'Message too long (max 10,000 chars)'}), 400
    sid = data['session_id']
    result = analyze_message(msg)
    if 'error' in result:
        return jsonify(result), 502
    session_manager.add_analysis(sid, result)
    return jsonify(result)

@app.route('/api/batch-analyze', methods=['POST'])
def batch_analyze():
    sid = request.form.get('session_id')
    if not sid:
        return jsonify({'error': 'Missing session_id'}), 400
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
    f = request.files['file']
    if not f.filename.endswith('.csv'):
        return jsonify({'error': 'Only CSV files accepted'}), 400
    
    # Check file size (max 3MB for Render free tier)
    f.seek(0, 2)
    file_size = f.tell()
    f.seek(0)
    if file_size > 3 * 1024 * 1024:
        return jsonify({'error': 'File too large (max 3MB)'}), 400
    
    import csv, io
    content = f.read().decode('utf-8', errors='ignore')
    
    try:
        reader = csv.DictReader(io.StringIO(content))
        if not reader.fieldnames or 'message' not in reader.fieldnames:
            return jsonify({'error': 'CSV must have a "message" column'}), 400
        
        messages = []
        for row in reader:
            msg = row.get('message', '').strip()
            if msg and len(msg) > 0:
                # Truncate very long messages to prevent API issues
                messages.append(msg[:1500])
                if len(messages) >= 8:  # Limit to 8 messages for faster processing
                    break
    except Exception as e:
        return jsonify({'error': f'CSV parsing error: {str(e)}'}), 400
    
    if not messages:
        return jsonify({'error': 'No valid messages found in CSV'}), 400
    
    # Process messages with timeout and concurrency limit
    results = []
    
    def process_single_message(msg, idx):
        try:
            result = analyze_message(msg)
            if 'error' not in result:
                result['original_message'] = msg[:80] + ('...' if len(msg) > 80 else '')
                return result
            else:
                return {'error': result['error'], 'original_message': msg[:80]}
        except Exception as e:
            return {'error': str(e), 'original_message': msg[:80]}
    
    # Use ThreadPoolExecutor with timeout
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        future_to_msg = {executor.submit(process_single_message, msg, i): i for i, msg in enumerate(messages)}
        for future in concurrent.futures.as_completed(future_to_msg, timeout=90):
            try:
                result = future.result(timeout=30)
                if 'error' not in result:
                    session_manager.add_analysis(sid, result)
                results.append(result)
            except concurrent.futures.TimeoutError:
                results.append({'error': 'Analysis timed out', 'original_message': 'Timeout'})
    
    agg = session_manager.get_analytics(sid)
    return jsonify({'results': results, 'aggregates': agg})

@app.route('/api/analytics', methods=['GET'])
def analytics():
    sid = request.args.get('session_id')
    if not sid:
        return jsonify({'error': 'Missing session_id'}), 400
    return jsonify(session_manager.get_analytics(sid))

@app.route('/api/examples', methods=['GET'])
def examples():
    return jsonify([
        {'id': 1, 'category': 'CEO Fraud', 'title': 'Urgent wire transfer', 'message': 'Hi, this is Mark (CEO). I need you to process an urgent wire transfer of $47,500 to a new vendor today. This is time-sensitive and confidential — do not discuss with other staff. Reply ASAP with confirmation.'},
        {'id': 2, 'category': 'Invoice Scam', 'title': 'Overdue payment notice', 'message': 'NOTICE: Invoice #8821 for $12,400 is now 45 days overdue. To avoid legal action, transfer funds to our NEW bank account (details attached). Previous account is no longer active. Process today to stop collection proceedings.'},
        {'id': 3, 'category': 'Credential Phishing', 'title': 'Password expiry warning', 'message': 'URGENT: Your Microsoft 365 account password expires in 2 hours. Failure to update will result in immediate account suspension. Click here to verify: http://micros0ft-security.net/renew-password'},
        {'id': 4, 'category': 'Package Scam', 'title': 'Customs fee required', 'message': 'DHL Express: Your package (tracking: DHL-48821-ZA) is held at customs. A fee of R149 must be paid within 24 hours or the package will be returned. Pay now: http://dhl-customs-za.com/pay'},
        {'id': 5, 'category': 'Fake Job Offer', 'title': 'Remote work opportunity', 'message': 'Congratulations! You have been selected for a remote data entry position paying $800/week. To confirm your position, please provide your SSN, bank account details, and ID copy for payroll setup. Start Monday!'},
        {'id': 6, 'category': 'MFA Bypass', 'title': 'IT security verification', 'message': 'IT Security Team: We detected a suspicious login attempt on your account from Nigeria. To secure your account, please reply with your current 6-digit authenticator code so we can lock the attacker out immediately.'},
        {'id': 7, 'category': 'Crypto Scam', 'title': 'Celebrity giveaway', 'message': 'Elon Musk OFFICIAL: I am giving away 5,000 BTC to support my followers during this economic crisis. Send 0.1-2 BTC to the address below and receive DOUBLE back within 24 hours. Limited time only!'},
    ])

if __name__ == '__main__':
    app.run(debug=True, port=5000)