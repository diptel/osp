"""Klien kecil PocketBase REST (tanpa dependensi luar)."""
import json
import urllib.error
import urllib.parse
import urllib.request


class PB:
    def __init__(self, url, email, password):
        self.url = url.rstrip("/")
        self.token = ""
        r = self.req("POST", "/api/collections/_superusers/auth-with-password",
                     {"identity": email, "password": password})
        self.token = r["token"]

    def req(self, method, path, body=None):
        data = json.dumps(body).encode() if body is not None else None
        rq = urllib.request.Request(self.url + path, data=data, method=method)
        rq.add_header("Content-Type", "application/json")
        if self.token:
            rq.add_header("Authorization", self.token)
        try:
            with urllib.request.urlopen(rq) as resp:
                raw = resp.read()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"{method} {path} -> {e.code}: {e.read().decode()}") from None

    def create(self, col, data):
        return self.req("POST", f"/api/collections/{col}/records", data)

    def update(self, col, rid, data):
        return self.req("PATCH", f"/api/collections/{col}/records/{rid}", data)

    def list(self, col, flt="", per_page=500):
        out, page = [], 1
        while True:
            q = urllib.parse.urlencode({"filter": flt, "perPage": per_page, "page": page})
            r = self.req("GET", f"/api/collections/{col}/records?{q}")
            out += r["items"]
            if page >= r["totalPages"]:
                return out
            page += 1

    def first(self, col, flt):
        q = urllib.parse.urlencode({"filter": flt, "perPage": 1, "skipTotal": 1})
        items = self.req("GET", f"/api/collections/{col}/records?{q}")["items"]
        return items[0] if items else None
