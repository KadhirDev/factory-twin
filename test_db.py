from sqlalchemy import create_engine, text

DATABASE_URL = "postgresql+psycopg://factory_user:FactoryTwin123@localhost:5432/factory_twin"

engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    result = conn.execute(text("SELECT version();"))
    print(result.scalar())