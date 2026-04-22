#!/usr/bin/env python3
"""Comprehensive test of the refined comic layout."""

import json
import requests
import time
from pathlib import Path

# Test cases with different content lengths and complexities
test_cases = [
    {
        "name": "Short Comic (3 panels)",
        "title": "Alice in Wonderland",
        "subject": "literature",
        "style": "cute_cartoon",
        "cast_mode": "auto",
        "theme_slug": "",
        "text": """Alice fell down a rabbit hole. She discovered a strange world.
        She met the Cheshire Cat and had many adventures.""",
    },
    {
        "name": "Medium Comic (5-6 panels)",
        "title": "The Solar System",
        "subject": "science",
        "style": "educational_kids",
        "cast_mode": "auto",
        "theme_slug": "",
        "text": """The Sun is the center of our solar system.
        There are eight planets orbiting the Sun.
        Mercury is closest, while Neptune is farthest.
        Each planet has unique characteristics and atmospheres.
        Some planets have moons, others have rings.
        Learning about planets helps us understand space.""",
    },
    {
        "name": "Complex Comic (6+ panels)",
        "title": "The French Revolution",
        "subject": "history",
        "style": "superhero_comic",
        "cast_mode": "auto",
        "theme_slug": "",
        "text": """The French Revolution began in 1789.
        People wanted freedom and equality.
        The Bastille was stormed by revolutionaries.
        New ideas about democracy emerged.
        The old monarchy system was challenged.
        Rights of Man declaration was created.
        This revolution inspired movements worldwide.
        It changed how governments work forever.""",
    },
]

def test_refined_layout():
    """Test the refined comic layout across different scenarios."""
    base_url = "http://127.0.0.1:5001"
    results = []
    
    for test in test_cases:
        print(f"\n{'='*60}")
        print(f"🎨 {test['name']}: {test['title']}")
        print(f"{'='*60}")
        
        # Generate comic
        response = requests.post(f"{base_url}/api/generate", data=test)
        
        if response.status_code not in [200, 202]:
            print(f"❌ Generation failed: {response.status_code}")
            print(response.text)
            results.append({"name": test["name"], "status": "failed", "error": response.text})
            continue
        
        data = response.json()
        
        if "job_id" in data:
            job_id = data["job_id"]
            print(f"⏳ Job queued: {job_id}")
            
            # Poll for completion
            start_time = time.time()
            for i in range(60):  # 60 second timeout
                time.sleep(1)
                job_response = requests.get(f"{base_url}/api/jobs/{job_id}")
                
                if job_response.status_code != 200:
                    print(f"❌ Job check failed: {job_response.status_code}")
                    break
                
                job_data = job_response.json()
                stage = job_data.get("stage", "unknown")
                progress = job_data.get("progress", 0)
                
                if stage == "completed":
                    comic_data = job_data.get("result", {})
                    image_url = comic_data.get("image_url", "")
                    comic_id = image_url.split("/")[-2] if image_url else ""
                    panel_count = comic_data.get("panel_count", 0)
                    
                    elapsed = time.time() - start_time
                    print(f"\n✅ Comic generated in {elapsed:.1f}s")
                    print(f"   Comic ID: {comic_id}")
                    print(f"   Panels: {panel_count}")
                    print(f"   Image URL: {base_url}{image_url}")
                    print(f"   Summary: {comic_data.get('summary', 'N/A')}")
                    
                    results.append({
                        "name": test["name"],
                        "status": "success",
                        "comic_id": comic_id,
                        "panels": panel_count,
                        "time": elapsed,
                        "image_url": f"{base_url}{image_url}"
                    })
                    break
                elif stage == "failed":
                    print(f"❌ Comic generation failed")
                    print(f"   Error: {job_data.get('error', 'unknown')}")
                    results.append({
                        "name": test["name"],
                        "status": "failed",
                        "error": job_data.get('error', 'unknown')
                    })
                    break
                else:
                    print(f"   [{progress}%] {stage}")
        
        elif "image_url" in data:
            print(f"✅ Comic generated instantly")
            print(f"   Panels: {data.get('panel_count', 'unknown')}")
            print(f"   Image URL: {base_url}{data['image_url']}")
            
            results.append({
                "name": test["name"],
                "status": "success",
                "panels": data.get('panel_count', 0),
                "image_url": f"{base_url}{data['image_url']}"
            })
    
    # Print summary
    print(f"\n\n{'='*60}")
    print("📊 TEST SUMMARY")
    print(f"{'='*60}")
    
    success_count = sum(1 for r in results if r["status"] == "success")
    total_count = len(results)
    
    print(f"\n✅ Successful: {success_count}/{total_count}")
    
    for result in results:
        status_icon = "✅" if result["status"] == "success" else "❌"
        print(f"\n{status_icon} {result['name']}")
        if result["status"] == "success":
            print(f"   Panels: {result.get('panels', 'N/A')}")
            if "time" in result:
                print(f"   Time: {result['time']:.1f}s")
            print(f"   Link: {result.get('image_url', 'N/A')[:80]}...")
        else:
            print(f"   Error: {result.get('error', 'Unknown')[:100]}...")
    
    print(f"\n{'='*60}")
    print("✨ Layout Refinement Validation Complete")
    print(f"{'='*60}\n")

if __name__ == "__main__":
    test_refined_layout()
