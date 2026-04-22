#!/usr/bin/env python3
"""Quick test of the new comic layout."""

import json
import requests
import time

# Test data
test_cases = [
    {
        "title": "The Grinch",
        "subject": "literature",
        "style": "cute_cartoon",
        "cast_mode": "auto",
        "theme_slug": "",
        "text": """The Grinch is a fictional character created by Dr. Seuss. 
        He is an old, cynical creature who hates Christmas. 
        He decides to steal Christmas from the town of Whoville. 
        But in the end, he learns the true meaning of Christmas and his heart grows three sizes.
        This teaches us that kindness and love can transform even the darkest hearts.""",
    }
]

def test_comic_generation():
    """Test comic generation with new layout."""
    base_url = "http://127.0.0.1:5001"
    
    for test in test_cases:
        print(f"\n🎨 Testing comic: {test['title']}")
        
        # Generate comic
        response = requests.post(f"{base_url}/api/generate", data=test)
        
        if response.status_code not in [200, 202]:
            print(f"❌ Generation failed: {response.status_code}")
            print(response.text)
            continue
        
        data = response.json()
        
        if "job_id" in data:
            job_id = data["job_id"]
            print(f"✅ Job queued: {job_id}")
            
            # Poll for completion
            for i in range(60):  # 60 second timeout
                time.sleep(1)
                job_response = requests.get(f"{base_url}/api/jobs/{job_id}")
                
                if job_response.status_code != 200:
                    print(f"❌ Job check failed: {job_response.status_code}")
                    break
                
                job_data = job_response.json()
                stage = job_data.get("stage", "unknown")
                progress = job_data.get("progress", 0)
                
                print(f"   Progress: {stage} ({progress}%)")
                
                if stage == "completed":
                    comic_data = job_data.get("result", {})
                    image_url = comic_data.get("image_url", "")
                    comic_id = image_url.split("/")[-2] if image_url else ""
                    
                    if comic_id:
                        print(f"✅ Comic generated: {comic_id}")
                        print(f"   Image: {base_url}{image_url}")
                        print(f"   Panels: {comic_data.get('panel_count', 'unknown')}")
                        print(f"   Visit: {base_url}/api/comics/{comic_id}")
                    break
                elif stage == "failed":
                    print(f"❌ Comic generation failed")
                    print(f"   Error: {job_data.get('error', 'unknown')}")
                    break
        
        elif "image_url" in data:
            print(f"✅ Comic generated instantly")
            print(f"   Image: {base_url}{data['image_url']}")
            print(f"   Panels: {data.get('panel_count', 'unknown')}")

if __name__ == "__main__":
    test_comic_generation()
