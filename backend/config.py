import os

MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days
ADMIN_EMAIL = os.environ.get('ADMIN_EMAIL', 'admin@rsm.eu')
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'Admin123!')
DEMO_PASSWORD = os.environ.get('DEMO_PASSWORD', 'Demo123!')
