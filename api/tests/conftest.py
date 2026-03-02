import os

# Set test environment variables before importing any app modules
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-for-testing")
os.environ.setdefault("CONNECTION_SECRET", "test-connection-secret-32chars!!")
os.environ.setdefault("DATABASE_URL", "sqlite://")
