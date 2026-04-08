from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    # PostgreSQL
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "factorytwin"
    postgres_user: str = "factory"
    postgres_password: str = "factory123"

    # Ditto
    ditto_base_url: str = "http://localhost:8080"
    ditto_username: str = "ditto"
    ditto_password: str = "ditto"

    # Kafka
    kafka_bootstrap_servers: str = "localhost:9092"
    kafka_telemetry_topic: str = "factory.telemetry"
    kafka_alerts_topic: str = "factory.alerts"

    # MQTT
    mqtt_broker_host: str = "localhost"
    mqtt_broker_port: int = 1883

    app_env: str = "development"

    class Config:
        env_file = ".env"

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

@lru_cache()
def get_settings() -> Settings:
    return Settings()