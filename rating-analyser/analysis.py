import pandas as pd
import numpy as np
import xgboost as xgb
from sklearn.ensemble import RandomForestRegressor, HistGradientBoostingRegressor
from sklearn.compose import TransformedTargetRegressor
from sklearn.preprocessing import OrdinalEncoder
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, r2_score
import pickle
import os
import io
from db import engine, songs, user_snapshots, user_scores
from sqlalchemy import select, join, and_

MODEL_PATH = "difficulty_model.pkl"

def fetch_data(min_plays=10):
    """
    Fetches training data from the database.
    Joins user_scores, user_snapshots, and songs.
    Filters for 'intl' region.
    Optional: filters out songs with fewer than min_plays.
    Returns a DataFrame.
    """
    print("Fetching data from database...")
    
    # Build the query using SQLAlchemy Core
    # We want: songs.levelPrecise (Y), user_snapshots.rating (X1), user_scores.achievement (X2)
    # Filter: songs.region = 'intl'
    # Note: The prompt implies we should filter for 'intl' region.
    
    # We need to join:
    # user_scores -> user_snapshots (on snapshotId)
    # user_scores -> songs (on songId)
    
    j = join(user_scores, user_snapshots, user_scores.c.snapshotId == user_snapshots.c.id) \
        .join(songs, user_scores.c.songId == songs.c.id)
    
    stmt = select(
        songs.c.levelPrecise.label("target_difficulty"),
        user_snapshots.c.rating.label("player_rating"),
        user_scores.c.achievement.label("score_achievement"),
        songs.c.id.label("song_id"),
        songs.c.songName,
        songs.c.difficulty,
        songs.c.level,
        songs.c.type, # Added song type
        songs.c.artist # Added artist for better grouping
    ).select_from(j).where(
        songs.c.region == 'intl'
    )
    
    # Read directly into DataFrame
    with engine.connect() as conn:
        df = pd.read_sql(stmt, conn)
    
    print(f"Fetched {len(df)} rows.")
    
    # Filter out songs with difficulty basic, advanced
    df = df[df['difficulty'] != 'basic']
    df = df[df['difficulty'] != 'advanced']

    if min_plays > 0:
        print(f"Filtering songs with fewer than {min_plays} plays...")
        # Group by songName, artist, type, difficulty instead of song_id
        # to calculate counts correctly across versions if song_id changes (though fetch_data joins on ID, 
        # so we assume the ID in DB might be unique per entry. 
        # If multiple song IDs map to same song, we should normalize BEFORE filtering.)
        
        # Actually, if we want to group by Name+Artist+Type+Difficulty, we should do that for aggregation.
        # Here we filter based on count.
        
        # Let's count based on the unique grouping key
        df['group_key'] = df['songName'] + "|" + df['artist'] + "|" + df['type'] + "|" + df['difficulty']
        
        song_counts = df['group_key'].value_counts()
        # Get keys that meet the threshold
        valid_keys = song_counts[song_counts >= min_plays].index
        
        original_len = len(df)
        df = df[df['group_key'].isin(valid_keys)]
        print(f"Filtered from {original_len} to {len(df)} rows.")
        
    return df

def fetch_player_ratings():
    """
    Fetches the latest rating for each player in the intl region.
    """
    print("Fetching player ratings...")
    
    # We want the latest snapshot for each user in 'intl' region
    # Use DISTINCT ON in Postgres
    
    stmt = select(
        user_snapshots.c.userId,
        user_snapshots.c.rating
    ).distinct(
        user_snapshots.c.userId
    ).where(
        user_snapshots.c.region == 'intl'
    ).order_by(
        user_snapshots.c.userId,
        user_snapshots.c.fetchedAt.desc()
    )
    
    with engine.connect() as conn:
        df = pd.read_sql(stmt, conn)
        
    print(f"Fetched {len(df)} unique player ratings.")
    return df

def fetch_active_users_count():
    """
    Fetches counts of active users based on their last snapshot date.
    Returns a dictionary with counts for 1d, 3d, 1w, 2w, 1m.
    """
    print("Fetching active user counts...")
    
    # We want to count users whose latest snapshot is within certain timeframes
    # We need the LATEST snapshot timestamp for each user in 'intl' region
    
    stmt = select(
        user_snapshots.c.userId,
        user_snapshots.c.fetchedAt
    ).distinct(
        user_snapshots.c.userId
    ).where(
        user_snapshots.c.region == 'intl'
    ).order_by(
        user_snapshots.c.userId,
        user_snapshots.c.fetchedAt.desc()
    )
    
    with engine.connect() as conn:
        df = pd.read_sql(stmt, conn)
        
    if df.empty:
        return {
            "usedIn1day": 0,
            "usedIn3days": 0,
            "usedIn1week": 0,
            "usedIn2weeks": 0,
            "usedIn1month": 0
        }
    
    # Ensure fetchedAt is datetime
    df['fetchedAt'] = pd.to_datetime(df['fetchedAt'])
    
    now = pd.Timestamp.now()
    
    counts = {
        "usedIn1day": len(df[df['fetchedAt'] >= now - pd.Timedelta(days=1)]),
        "usedIn3days": len(df[df['fetchedAt'] >= now - pd.Timedelta(days=3)]),
        "usedIn1week": len(df[df['fetchedAt'] >= now - pd.Timedelta(weeks=1)]),
        "usedIn2weeks": len(df[df['fetchedAt'] >= now - pd.Timedelta(weeks=2)]),
        "usedIn1month": len(df[df['fetchedAt'] >= now - pd.Timedelta(days=30)])
    }
    
    print(f"Active user counts: {counts}")
    return counts

def plot_snapshots_per_day():
    """
    Generates a line plot of snapshots per day.
    Returns the image as bytes.
    """
    print("Plotting snapshots per day...")
    
    # We need to count snapshots by fetchedAt date (ignoring time)
    # We want ALL snapshots in intl region, not just latest per user
    
    stmt = select(
        user_snapshots.c.fetchedAt
    ).where(
        user_snapshots.c.region == 'intl'
    )
    
    with engine.connect() as conn:
        df = pd.read_sql(stmt, conn)
        
    if df.empty:
        return None
    
    # Ensure datetime
    df['fetchedAt'] = pd.to_datetime(df['fetchedAt'])
    
    # Resample by day
    daily_counts = df.resample('D', on='fetchedAt').size()
    
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        
        plt.figure(figsize=(12, 6))
        daily_counts.plot(kind='line', color='skyblue', marker='o')
        plt.title('Snapshots per Day (Intl)')
        plt.xlabel('Date')
        plt.ylabel('Number of Snapshots')
        plt.grid(True, alpha=0.5)
        plt.tight_layout()
        
        img = io.BytesIO()
        plt.savefig(img, format='png')
        img.seek(0)
        plt.close()
        
        return img
    except Exception as e:
        print(f"Plotting failed: {e}")
        return None

def plot_ratings_distribution():
    """
    Generates a histogram of player ratings.
    Returns the image as bytes.
    """
    df = fetch_player_ratings()
    
    if df.empty:
        return None
        
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        
        plt.figure(figsize=(10, 6))
        plt.hist(df['rating'], bins=50, color='skyblue', edgecolor='black', alpha=0.7)
        plt.title('Player Rating Distribution (Intl)')
        plt.xlabel('Rating')
        plt.ylabel('Count')
        plt.grid(axis='y', alpha=0.5)
        
        img = io.BytesIO()
        plt.savefig(img, format='png')
        img.seek(0)
        plt.close()
        
        return img
    except Exception as e:
        print(f"Plotting failed: {e}")
        return None

def aggregate_data(df):
    """
    Aggregates raw score data into song-level features.
    """
    print("Aggregating data by song...")
    
    # Create boolean columns first for speed
    df['is_95'] = df['score_achievement'] >= 950000
    df['is_97'] = df['score_achievement'] >= 970000
    df['is_99'] = df['score_achievement'] >= 990000
    df['is_100'] = df['score_achievement'] >= 1000000
    df['is_100_5'] = df['score_achievement'] >= 1005000
    
    # Calculate total unique players per song (approximate via count if one score per player per song)
    # Assuming input DF has one row per player-song combination
    
    group_cols = ['songName', 'artist', 'type', 'difficulty', 'level', 'target_difficulty']
    
    # First, get counts of successes
    stats = df.groupby(group_cols).agg(
        count_95=('is_95', 'sum'),
        count_97=('is_97', 'sum'),
        count_99=('is_99', 'sum'),
        count_100=('is_100', 'sum'),
        count_100_5=('is_100_5', 'sum'),
        total_players=('score_achievement', 'count')
    ).reset_index()
    
    # Calculate percentages
    stats['p_95'] = stats['count_95'] / stats['total_players']
    stats['p_97'] = stats['count_97'] / stats['total_players']
    stats['p_99'] = stats['count_99'] / stats['total_players']
    stats['p_100'] = stats['count_100'] / stats['total_players']
    stats['p_100_5'] = stats['count_100_5'] / stats['total_players']
    
    # Add ordinal difficulty
    level_map = {'1': 1, '1+': 1, '2': 2, '2+': 2, '3': 3, '3+': 3, '4': 4, '4+': 4, '5': 5, '5+': 5, '6': 6, '6+': 6, '7': 7, '7+': 7, '8': 8, '8+': 8, '9': 9, '9+': 9, '10': 10, '10+': 10, '11': 11, '11+': 11, '12': 12, '12+': 12, '13': 13, '13+': 13, '14': 14, '14+': 14, '15': 15, '15+': 15, '16': 16, '16+': 16}
    stats['difficulty_ordinal'] = stats['level'].map(level_map).fillna(-1)
    
    print(f"Aggregated into {len(stats)} song rows.")
    return stats

def power_transform(x):
    # Ensure input is 2D array for sklearn
    if x.ndim == 1:
        x = x.reshape(-1, 1)
    return np.power(x, 1.1)

def inverse_power_transform(x):
    # Ensure input is 2D array for sklearn
    if x.ndim == 1:
        x = x.reshape(-1, 1)
    return np.power(x, 1/1.1)

def train_model(min_plays=10, model_type='xgboost'):
    """
    Trains a regression model on aggregated song data.
    """
    raw_df = fetch_data(min_plays=min_plays)
    
    if raw_df.empty:
        print("No data found.")
        return None
    
    # Aggregate data
    df = aggregate_data(raw_df)
    
    # Save to CSV
    df.to_csv('training_data_aggregated.csv', index=False)
    print("Saved aggregated training data to training_data_aggregated.csv")
    
    # Features: Percentages + Difficulty Ordinal
    feature_cols = ['p_95', 'p_97', 'p_99', 'p_100', 'p_100_5', 'difficulty_ordinal']
    X = df[feature_cols]
    y = df['target_difficulty']
    
    print(f"Training model ({model_type}) on song-level features...")
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    if model_type == 'xgboost':
        base_model = xgb.XGBRegressor(
            n_estimators=500,
            learning_rate=0.05,
            max_depth=4, # Reduced depth for smaller dataset
            min_child_weight=1,
            subsample=0.8,
            colsample_bytree=0.8,
            random_state=42,
            n_jobs=-1
        )
    elif model_type == 'random_forest':
        base_model = RandomForestRegressor(
            n_estimators=200,
            max_depth=10,
            min_samples_split=5,
            min_samples_leaf=2,
            random_state=42,
            n_jobs=-1
        )
    else: 
        base_model = HistGradientBoostingRegressor(
            max_iter=500,
            learning_rate=0.05,
            max_depth=8,
            min_samples_leaf=10,
            categorical_features=[4], # The 5th feature (index 4) is difficulty_ordinal
            random_state=42
        )
    
    # Use simple regression or TransformedTargetRegressor
    # Level is still exponential-ish, so let's keep the power transform
    model = TransformedTargetRegressor(
        regressor=base_model,
        func=power_transform,
        inverse_func=inverse_power_transform,
        check_inverse=False 
    )
    
    model.fit(X_train, y_train)
    
    y_pred = model.predict(X_test)
    mse = mean_squared_error(y_test, y_pred)
    r2 = r2_score(y_test, y_pred)
    
    print(f"Model trained ({model_type}). MSE: {mse:.4f}, R2: {r2:.4f}")
    
    with open(MODEL_PATH, 'wb') as f:
        pickle.dump(model, f)
    
    print(f"Model saved to {MODEL_PATH}")
    
    # Visualize
    try:
        import matplotlib
        matplotlib.use('Agg') 
        import matplotlib.pyplot as plt
        
        # 2D Plot: Actual vs Predicted
        plt.figure(figsize=(10, 6))
        plt.scatter(y_test, y_pred, alpha=0.5)
        plt.plot([y.min(), y.max()], [y.min(), y.max()], 'r--', lw=2)
        plt.xlabel("Actual Difficulty")
        plt.ylabel("Predicted Difficulty")
        plt.title(f"Actual vs Predicted Difficulty (MSE: {mse:.2f}, R2: {r2:.2f})")
        plt.savefig("model_performance.png")
        print("Saved visualization to model_performance.png")
        plt.close()
        
        # 3D Plot: p_97 vs Difficulty Ordinal vs Predicted Level
        # We'll use p_97 as it captures the base clear rate roughly
        fig = plt.figure(figsize=(12, 8))
        ax = fig.add_subplot(111, projection='3d')
        
        scatter = ax.scatter(
            X_test['p_97'], 
            X_test['difficulty_ordinal'], 
            y_pred, 
            c=y_pred, 
            cmap='viridis', 
            marker='o',
            alpha=0.6,
            label='Predicted Data'
        )
        
        ax.set_xlabel('Pct >= 97%')
        ax.set_ylabel('Difficulty Type')
        ax.set_zlabel('Predicted Level')
        ax.set_title('Clear Rate vs Type vs Predicted Level')
        
        plt.colorbar(scatter, label='Predicted Level')
        plt.savefig("model_3d_visualization.png")
        plt.close()
        
    except ImportError:
        print("Matplotlib not installed, skipping visualization.")
    except Exception as e:
        print(f"Visualization failed: {e}")
        import traceback
        traceback.print_exc()
        
    return model

def load_model():
    if os.path.exists(MODEL_PATH):
        with open(MODEL_PATH, 'rb') as f:
            return pickle.load(f)
    return None

def analyze_songs(min_plays=10):
    """
    Predicts difficulty for aggregated songs.
    """
    model = load_model()
    if not model:
        print("Model not found. Please train it first.")
        return None
        
    raw_df = fetch_data(min_plays=min_plays)
    if raw_df.empty: return None
    
    # Aggregate
    df = aggregate_data(raw_df)
    
    feature_cols = ['p_95', 'p_97', 'p_99', 'p_100', 'p_100_5', 'difficulty_ordinal']
    X = df[feature_cols]
    
    # Predict
    df['predicted_difficulty'] = model.predict(X)
    df['discrepancy'] = df['predicted_difficulty'] - df['target_difficulty']
    
    # Sort
    # df = df.sort_values(by='predicted_difficulty', ascending=False)
    df = df.sort_values(by='discrepancy', ascending=False)
    
    # Save
    df.to_csv('song_stats.csv', index=False)
    print("Saved analysis results to song_stats.csv")
    
    return df

def calculate_standard_score(df):
    """
    Calculates a 'standard score' based on a composite of achievement percentages,
    relative to other songs in the same difficulty level.
    
    Composite Score = 0.4 * p_97 + 0.2 * p_99 + 0.1 * p_100 + 0.1 * p_100_5 + 0.2 * p_95 (implicitly roughly)
    Actually user specified: 0.4 * p_97 + 0.2 * p_99 + 0.1 * p_100 + 0.1 * p_100_5
    This sums to 0.8. Let's normalize or just use it as a raw score.
    
    We will calculate this score for each song, then compare it to the average score
    of all songs with the same integer level.
    """
    print("Calculating standard scores (heuristic approach)...")
    
    # Calculate composite score
    # Higher score = Easier song (more people achieving high ranks)
    df['composite_score'] = (
        0.05 * df['p_95'] + 
        0.25 * df['p_97'] + 
        0.1 * df['p_99'] + 
        0.2 * df['p_100'] + 
        0.3 * df['p_100_5']
    )
    
    # Calculate average composite score per level (using level or level directly)
    # level is mapped from level (e.g. 12, 12+, 13)
    level_stats = df.groupby('level')['composite_score'].agg(['mean', 'std']).reset_index()
    level_stats.rename(columns={'mean': 'level_mean', 'std': 'level_std'}, inplace=True)
    
    # Merge back
    df = df.merge(level_stats, on='level', how='left')
    
    # Z-score: (x - mean) / std
    # Positive Z-score = Easier than average for this level
    # Negative Z-score = Harder than average for this level
    df['z_score'] = (df['composite_score'] - df['level_mean']) / df['level_std'].replace(0, 1)
    
    # We can convert Z-score to a difficulty adjustment
    # Heuristic: 1 standard deviation might correspond to some difficulty increment
    # e.g., if Z-score is -1 (harder), maybe it should be +0.2 levels higher?
    # This is purely experimental. Let's just output the Z-score as the metric for now.
    
    # Let's try to map it to predicted difficulty
    # target_difficulty - (z_score * factor)
    # If z_score is +ve (easier), difficulty should be lower.
    # Factor to be tuned. Let's say 1 std dev = 0.5 level difference?
    # target_difficulty is 10x (e.g., 13.5 = 135). So 0.5 level = 5.
    if False:
        df['heuristic_difficulty'] = df['target_difficulty'] - df['z_score']
    else:
        def achievement_curve(diff: float):
            if diff <= -4:
                return -5
            elif diff < -1:
                return -1 + diff
            elif diff < 1:
                return 2 * diff
            elif diff < 4:
                return 1 + diff
            return 5
        # Base the difficulty on the level
        level_map = {'1': 12.5, '1+': 17.5, '2': 22.5, '2+': 27.5, '3': 32.5, '3+': 37.5, '4': 42.5, '4+': 47.5, '5': 52.5, '5+': 57.5, '6': 62.5, '6+': 67.5, '7': 72.5, '7+': 77.5, '8': 82.5, '8+': 87.5, '9': 92.5, '9+': 97.5, '10': 102.5, '10+': 107.5, '11': 112.5, '11+': 117.5, '12': 122.5, '12+': 127.5, '13': 132.5, '13+': 137.5, '14': 142.5, '14+': 147.5, '15': 152.5, '15+': 157.5, '16': 162.5, '16+': 167.5}
        df['heuristic_difficulty'] = df['level'].map(level_map).fillna(df['target_difficulty']) - df['z_score'].map(achievement_curve)
    
    df['discrepancy_heuristic'] = df['heuristic_difficulty'] - df['target_difficulty']
    
    # Sort by discrepancy (negative discrepancy means we think it should be lower level = it's Overrated?)
    # Wait:
    # Z-score positive -> Easier -> heuristic_diff < target -> discrepancy negative.
    # So negative discrepancy = Overrated (official is too high).
    # Positive discrepancy = Underrated (official is too low).
    
    df = df.sort_values(by='discrepancy_heuristic', ascending=False)
    df = df.sort_values(by='heuristic_difficulty', ascending=False)
    
    # Filter columns
    df = df[['songName', 'artist', 'type', 'difficulty', 'target_difficulty', 'heuristic_difficulty', 'discrepancy_heuristic']]
    
    # Save
    df.to_csv('song_stats_heuristic.csv', index=False)
    print("Saved heuristic analysis results to song_stats_heuristic.csv")
    
    return df

if __name__ == "__main__":
    # For manual testing
    train_model()
    stats = analyze_songs()
    
    # Run heuristic analysis
    if stats is not None:
        print("Running heuristic analysis...")
        heuristic_stats = calculate_standard_score(stats)
        print(heuristic_stats[['songName', 'target_difficulty', 'composite_score', 'z_score', 'heuristic_difficulty']].head(20))
