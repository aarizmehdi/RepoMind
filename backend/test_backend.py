import os
import asyncio
import httpx

async def test_backend():
    print("Testing backend ingestion...")
    try:
        async with httpx.AsyncClient() as client:
            res = await client.get("http://localhost:8000/health")
            print("Health check:", res.status_code, res.text)
    except Exception as e:
        print("Backend is not reachable!", str(e))

if __name__ == "__main__":
    asyncio.run(test_backend())
