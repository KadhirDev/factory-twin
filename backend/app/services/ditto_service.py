import logging
from typing import Any, Dict, Optional

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class DittoService:
    def __init__(self) -> None:
        self.base_url = settings.ditto_base_url.rstrip("/")
        self.auth = (settings.ditto_username, settings.ditto_password)
        self.headers = {
            "Content-Type": "application/json",
        }

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            auth=self.auth,
            headers=self.headers,
            timeout=10.0,
        )

    async def create_thing(
        self,
        namespace: str,
        thing_name: str,
        attributes: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Create a new digital twin in Eclipse Ditto."""
        thing_id = f"{namespace}:{thing_name}"
        payload = {
            "attributes": attributes,
            "features": {
                "telemetry": {
                    "properties": {
                        "temperature": None,
                        "vibration": None,
                        "pressure": None,
                        "rpm": None,
                        "power_consumption": None,
                        "oil_level": None,
                    }
                },
                "status": {
                    "properties": {
                        "operational": True,
                        "last_seen": None,
                    }
                },
            },
        }

        async with self._client() as client:
            resp = await client.put(
                f"{self.base_url}/api/2/things/{thing_id}",
                json=payload,
            )
            resp.raise_for_status()
            logger.info("Ditto thing created: %s", thing_id)
            return {"thing_id": thing_id, "status": resp.status_code}

    async def update_telemetry(self, thing_id: str, telemetry: Dict[str, Any]) -> bool:
        """Update telemetry feature properties of a digital twin."""
        props = {k: v for k, v in telemetry.items() if v is not None}

        if not props:
            logger.warning("No telemetry values to update for %s", thing_id)
            return False

        try:
            async with self._client() as client:
                resp = await client.patch(
                    f"{self.base_url}/api/2/things/{thing_id}/features/telemetry/properties",
                    json=props,
                )

            if resp.status_code in (200, 201, 204):
                logger.info("Telemetry updated for %s", thing_id)
                return True

            logger.warning(
                "Ditto telemetry update failed for %s: %s - %s",
                thing_id,
                resp.status_code,
                resp.text,
            )
            return False
        except Exception as e:
            logger.warning("Ditto telemetry update exception for %s: %s", thing_id, e)
            return False

    async def update_ditto_telemetry(self, machine_id: str, telemetry: Dict[str, Any]) -> bool:
        """
        Convenience wrapper to update telemetry using machine_id.
        Converts machine_id -> factory:<machine_id> automatically.
        """
        thing_id = f"factory:{machine_id}"
        return await self.update_telemetry(thing_id, telemetry)

    async def update_status(self, thing_id: str, operational: bool, last_seen: str) -> bool:
        """Update status feature of a digital twin."""
        try:
            async with self._client() as client:
                resp = await client.patch(
                    f"{self.base_url}/api/2/things/{thing_id}/features/status/properties",
                    json={"operational": operational, "last_seen": last_seen},
                )

            if resp.status_code in (200, 201, 204):
                logger.info("Status updated for %s", thing_id)
                return True

            logger.warning(
                "Ditto status update failed for %s: %s - %s",
                thing_id,
                resp.status_code,
                resp.text,
            )
            return False
        except Exception as e:
            logger.warning("Ditto status update exception for %s: %s", thing_id, e)
            return False

    async def get_thing(self, thing_id: str) -> Optional[Dict[str, Any]]:
        """Fetch a digital twin by ID."""
        async with self._client() as client:
            resp = await client.get(f"{self.base_url}/api/2/things/{thing_id}")
            if resp.status_code == 200:
                return resp.json()

            logger.warning("Failed to fetch Ditto thing %s: %s", thing_id, resp.status_code)
            return None

    async def list_things(self, namespace: str = "factory") -> list:
        """List all digital twins in a namespace."""
        async with self._client() as client:
            resp = await client.get(
                f"{self.base_url}/api/2/things",
                params={"namespaces": namespace, "limit": 100},
            )
            if resp.status_code == 200:
                data = resp.json()
                if isinstance(data, dict):
                    return data.get("items", [])
                if isinstance(data, list):
                    return data
                return []

            logger.warning(
                "Failed to list Ditto things for namespace %s: %s",
                namespace,
                resp.status_code,
            )
            return []

    async def delete_thing(self, thing_id: str) -> bool:
        """Delete a digital twin."""
        async with self._client() as client:
            resp = await client.delete(f"{self.base_url}/api/2/things/{thing_id}")
            if resp.status_code == 204:
                logger.info("Ditto thing deleted: %s", thing_id)
                return True

            logger.warning("Failed to delete Ditto thing %s: %s", thing_id, resp.status_code)
            return False


ditto_service = DittoService()