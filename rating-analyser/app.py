from flask import Flask, jsonify, request
import threading
import analysis
import pandas as pd
import traceback

app = Flask(__name__)

# Global variable to store analysis status/results if needed
analysis_cache = None
is_training = False

@app.route('/')
def index():
    return jsonify({
        "status": "ok",
        "service": "rating-analyser",
        "db_connected": check_db_connection()
    })

def check_db_connection():
    try:
        from db import get_db_connection
        from sqlalchemy import text
        with get_db_connection() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception as e:
        return str(e)

@app.route('/train', methods=['POST'])
def train():
    global is_training
    if is_training:
        return jsonify({"status": "error", "message": "Training already in progress"}), 409
    
    def run_training():
        global is_training
        try:
            # Get parameters from request via closure or passed args (simple for now)
            # Note: Flask request context is not available in thread without extra work, 
            # but we can capture args before starting thread if needed.
            # For now, using defaults or hardcoded is safer for background task.
            # To support args, we'd need to pass them to run_training.
            
            print("Starting training...")
            # Default to filtering songs with < 10 plays for training stability
            analysis.train_model(min_plays=10)
            print("Training completed.")
        except Exception as e:
            print(f"Training failed: {e}")
            traceback.print_exc()
        finally:
            is_training = False

    is_training = True
    thread = threading.Thread(target=run_training)
    thread.start()
    
    return jsonify({"status": "accepted", "message": "Training started in background"})

@app.route('/analysis', methods=['GET'])
def get_analysis():
    try:
        # Retrieve top N discrepancies
        limit = int(request.args.get('limit', 20))
        min_plays = int(request.args.get('min_plays', 10))
        
        stats = analysis.analyze_songs(min_plays=min_plays)
        
        if stats is None:
            return jsonify({"status": "error", "message": "Model not trained or no data"}), 404
            
        # Convert to dict
        results = stats.head(limit).to_dict(orient='records')
        
        return jsonify({
            "status": "success",
            "count": len(results),
            "data": results
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/heuristic', methods=['GET'])
def get_heuristic_analysis():
    try:
        # Retrieve top N discrepancies
        limit = int(request.args.get('limit', 20))
        min_plays = int(request.args.get('min_plays', 10))
        
        # First get analysis (or just aggregated data)
        raw_df = analysis.fetch_data(min_plays=min_plays)
        if raw_df.empty:
            return jsonify({"status": "error", "message": "No data"}), 404
            
        aggregated = analysis.aggregate_data(raw_df)
        stats = analysis.calculate_standard_score(aggregated)
        
        if stats is None:
            return jsonify({"status": "error", "message": "Could not calculate heuristic stats"}), 404
            
        # Convert to dict
        results = stats.head(limit).to_dict(orient='records')
        
        return jsonify({
            "status": "success",
            "count": len(results),
            "data": results
        })
    except Exception as e:
        print(f"Heuristic analysis failed: {e}")
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/ratings/distribution', methods=['GET'])
def get_ratings_distribution():
    try:
        img_buffer = analysis.plot_ratings_distribution()
        if img_buffer is None:
            return jsonify({"status": "error", "message": "Could not generate plot (no data?)"}), 404
            
        from flask import send_file
        return send_file(img_buffer, mimetype='image/png')
    except Exception as e:
        print(f"Rating distribution failed: {e}")
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/users/active', methods=['GET'])
def get_active_users():
    try:
        counts = analysis.fetch_active_users_count()
        return jsonify({
            "status": "success",
            "data": counts
        })
    except Exception as e:
        print(f"Active users fetch failed: {e}")
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/snapshots/daily', methods=['GET'])
def get_snapshots_daily_plot():
    try:
        img_buffer = analysis.plot_snapshots_per_day()
        if img_buffer is None:
            return jsonify({"status": "error", "message": "Could not generate plot (no data?)"}), 404
            
        from flask import send_file
        return send_file(img_buffer, mimetype='image/png')
    except Exception as e:
        print(f"Snapshots daily plot failed: {e}")
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=12234, debug=True)

