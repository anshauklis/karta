import os
import sys
from pathlib import Path

# Add api/ root to sys.path so tests can import flat modules (sql_params, etc.)
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Set test environment variables before importing any app modules
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-for-testing")
os.environ.setdefault("CONNECTION_SECRET", "test-connection-secret-32chars!!")
os.environ.setdefault("DATABASE_URL", "sqlite://")
