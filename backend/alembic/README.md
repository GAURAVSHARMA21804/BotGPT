# Alembic migrations

Initialize Alembic in this directory when you are ready:

1. `alembic init alembic`
2. Configure `sqlalchemy.url` in `alembic.ini`
3. Create migrations with `alembic revision --autogenerate -m "init"`
4. Apply migrations with `alembic upgrade head`
