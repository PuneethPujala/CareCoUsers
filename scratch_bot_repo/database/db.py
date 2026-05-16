"""
MongoDB Database Module
Stores all call analysis results for retrieval by the admin app.
"""

from pymongo import MongoClient
from datetime import datetime
from typing import Optional, List, Dict

# MongoDB connection string
MONGO_URI = "mongodb://localhost:27017/"
DB_NAME = "carecall"
COLLECTION_NAME = "call_results"

_client = None

def get_connection() -> MongoClient:
    """Get a MongoDB connection."""
    global _client
    if _client is None:
        _client = MongoClient(MONGO_URI)
    return _client


def init_db():
    """Initialize the database and verify connection."""
    try:
        client = get_connection()
        # Ping the server to verify connection
        client.admin.command('ping')
        
        # Ensure indexes 
        db = client[DB_NAME]
        collection = db[COLLECTION_NAME]
        collection.create_index("status")
        collection.create_index([("created_at", -1)])
        
        print(f"[Database] Connected to MongoDB at: {MONGO_URI}, DB: {DB_NAME}")
    except Exception as e:
        print(f"[Database] Failed to connect to MongoDB: {e}")


def create_job(job_id: str, audio_filename: str) -> Dict:
    """Create a new job entry with 'processing' status."""
    client = get_connection()
    db = client[DB_NAME]
    collection = db[COLLECTION_NAME]

    now = datetime.utcnow().isoformat()
    job_doc = {
        "id": job_id,
        "status": "processing",
        "audio_filename": audio_filename,
        "created_at": now,
        "completed_at": None,
        "error_message": None,
        "result_json": None  # Now natively stores dict/JSON without stringifying
    }

    collection.insert_one(job_doc.copy())

    return {
        "id": job_id,
        "status": "processing",
        "audio_filename": audio_filename,
        "created_at": now
    }


def update_job(job_id: str, status: str, result: dict = None, error: str = None):
    """Update a job's status, result, or error message."""
    client = get_connection()
    db = client[DB_NAME]
    collection = db[COLLECTION_NAME]

    now = datetime.utcnow().isoformat()

    update_fields = {
        "status": status,
        "completed_at": now
    }

    if status == "completed" and result:
        update_fields["result_json"] = result
    elif status == "failed" and error:
        update_fields["error_message"] = error

    collection.update_one(
        {"id": job_id},
        {"$set": update_fields}
    )


def get_job(job_id: str) -> Optional[Dict]:
    """Get a single job by ID."""
    client = get_connection()
    db = client[DB_NAME]
    collection = db[COLLECTION_NAME]

    # Exclude the internal _id field so it doesn't break FastAPI serialization
    job = collection.find_one({"id": job_id}, {"_id": 0})
    return job


def get_all_jobs(limit: int = 50, offset: int = 0) -> List[Dict]:
    """Get all jobs ordered by creation date (newest first)."""
    client = get_connection()
    db = client[DB_NAME]
    collection = db[COLLECTION_NAME]

    cursor = collection.find({}, {"_id": 0}).sort("created_at", -1).skip(offset).limit(limit)
    return list(cursor)


def get_job_count() -> int:
    """Get total number of jobs."""
    client = get_connection()
    db = client[DB_NAME]
    collection = db[COLLECTION_NAME]
    
    return collection.count_documents({})
