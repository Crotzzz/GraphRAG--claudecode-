import json
from pathlib import Path

CONFIG_FILE = Path(__file__).parent.parent.parent / "data" / "config.json"

DEFAULT_CONFIG = {
    "llm_provider": "deepseek",
    "llm_model": "deepseek-v4-flash",
    "llm_base_url": "https://api.deepseek.com",
    "mineru_model": "vlm",
    "mineru_language": "ch",
    "concurrent_tasks": 3,
}


class ConfigService:
    def __init__(self):
        self._config = self._load()

    def _load(self) -> dict:
        if CONFIG_FILE.exists():
            return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        return dict(DEFAULT_CONFIG)

    def _save(self):
        CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
        CONFIG_FILE.write_text(json.dumps(self._config, ensure_ascii=False, indent=2), encoding="utf-8")

    def get_all(self) -> dict:
        return dict(self._config)

    def update(self, updates: dict) -> dict:
        self._config.update(updates)
        self._save()
        return self.get_all()
