"""2026-11-14 — the reference-list routers, measured over HTTP against a real
PostgreSQL 16.15. Every check is a request; nothing is asserted by reading."""
import asyncio, os, sys
os.environ["TEST_DSN"] = "postgresql+asyncpg://postgres@/ll?host=" + sys.argv[1] + "&port=55433"
from fastapi import FastAPI, APIRouter
import httpx
from app.api.routes import admin, reference, admin_reference

agg = APIRouter()
agg.include_router(admin.router)
agg.include_router(reference.router)
agg.include_router(admin_reference.router)
app = FastAPI(); app.include_router(agg, prefix="/api")

ADMIN = {"Authorization": "Bearer admintok"}
TEACH = {"Authorization": "Bearer teachtok"}
NONE  = {}

ok = fail = 0
def check(label, cond, detail=""):
    global ok, fail
    if cond: ok += 1;  print(f"  ok   {label}" + (f"   {detail}" if detail else ""))
    else:    fail += 1; print(f"  FAIL {label}   {detail}")

async def main():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),
                                 base_url="http://t") as c:
        print("\n-- the teacher-facing lists --")
        r = await c.get("/api/reference/lists", headers=TEACH)
        check("GET /reference/lists as a teacher", r.status_code == 200, str(r.status_code))
        body = r.json()
        check("4 colleges", len(body) == 4, f"{len(body)}")
        by = {x["code"]: x for x in body}
        check("order is sort_order", [x["code"] for x in body] == ["CVMAS","CBMA","CoEd","CAST"],
              str([x["code"] for x in body]))
        check("CAST has 3 courses", len(by["CAST"]["courses"]) == 3, str(len(by["CAST"]["courses"])))
        check("CBMA has 6 courses", len(by["CBMA"]["courses"]) == 6, str(len(by["CBMA"]["courses"])))
        check("CoEd has 5 courses", len(by["CoEd"]["courses"]) == 5, str(len(by["CoEd"]["courses"])))
        check("CVMAS reaches 6th year", max(y["level"] for y in by["CVMAS"]["year_levels"]) == 6)
        check("CAST reaches 3rd year",  max(y["level"] for y in by["CAST"]["year_levels"]) == 3)
        check("badge colour travels", by["CAST"]["badge_bg"] == "#faece7", by["CAST"]["badge_bg"])
        check("in_use hidden from teachers", by["CAST"]["in_use"] is None, str(by["CAST"]["in_use"]))
        check("the exact seeded course name survives",
              "Bachelor of Science in Business Administration: Major in Financial Management"
              in [x["name"] for x in by["CBMA"]["courses"]])

        print("\n-- who may maintain them --")
        check("teacher POST college -> 403",
              (await c.post("/api/admin/reference/colleges",
                            json={"code":"X","name":"X"}, headers=TEACH)).status_code == 403)
        check("teacher GET admin list -> 403",
              (await c.get("/api/admin/reference/colleges", headers=TEACH)).status_code == 403)
        # MEASURED, not assumed: HTTPBearer answers 401 for a missing header,
        # a non-Bearer scheme AND an unknown token; 403 is reserved for a
        # caller who IS authenticated and is not an administrator. The same
        # three values the 2026-11-13 admin verification recorded.
        check("anonymous -> 401",
              (await c.get("/api/admin/reference/colleges", headers=NONE)).status_code == 401)
        check("unknown token -> 401",
              (await c.get("/api/admin/reference/colleges",
                           headers={"Authorization": "Bearer nope"})).status_code == 401)
        check("non-Bearer scheme -> 401",
              (await c.get("/api/admin/reference/colleges",
                           headers={"Authorization": "Basic abc"})).status_code == 401)
        check("teacher may still READ the lists",
              (await c.get("/api/reference/lists", headers=TEACH)).status_code == 200)

        print("\n-- the administrator listing --")
        r = await c.get("/api/admin/reference/colleges", headers=ADMIN)
        check("admin GET -> 200", r.status_code == 200, str(r.status_code))
        adm = {x["code"]: x for x in r.json()}
        check("CAST in_use = 1 (one profile holds it)", adm["CAST"]["in_use"] == 1,
              str(adm["CAST"]["in_use"]))
        check("CVMAS in_use = 0", adm["CVMAS"]["in_use"] == 0, str(adm["CVMAS"]["in_use"]))

        print("\n-- adding a college, the thing the CHECK constraint used to forbid --")
        r = await c.post("/api/admin/reference/colleges",
                         json={"code":"CCJE","name":"College of Criminal Justice Education (CCJE)",
                               "sort_order":5}, headers=ADMIN)
        check("POST college -> 201", r.status_code == 201, str(r.status_code))
        ccje = r.json()["college_id"]
        check("default badge colour applied", r.json()["badge_bg"] == "#eef1f4", r.json()["badge_bg"])
        check("duplicate code -> 409",
              (await c.post("/api/admin/reference/colleges",
                            json={"code":"CCJE","name":"dup"}, headers=ADMIN)).status_code == 409)
        check("blank name -> 422",
              (await c.post("/api/admin/reference/colleges",
                            json={"code":"ZZ","name":"   "}, headers=ADMIN)).status_code == 422)
        r = await c.post(f"/api/admin/reference/colleges/{ccje}/courses",
                         json={"name":"Bachelor of Science in Criminology"}, headers=ADMIN)
        check("POST course -> 201", r.status_code == 201, str(r.status_code))
        crim = r.json()["course_id"]
        check("duplicate course -> 409",
              (await c.post(f"/api/admin/reference/colleges/{ccje}/courses",
                            json={"name":"Bachelor of Science in Criminology"},
                            headers=ADMIN)).status_code == 409)
        r = await c.post(f"/api/admin/reference/colleges/{ccje}/year-levels",
                         json={"level":4,"label":"4th Year"}, headers=ADMIN)
        check("POST year level -> 201", r.status_code == 201, str(r.status_code))
        check("year level 7 -> 422",
              (await c.post(f"/api/admin/reference/colleges/{ccje}/year-levels",
                            json={"level":7,"label":"7th"}, headers=ADMIN)).status_code == 422)
        r = await c.get("/api/reference/lists", headers=TEACH)
        check("the new college reaches the teacher's dropdown",
              "CCJE" in [x["code"] for x in r.json()])

        print("\n-- what a profile is standing on cannot be moved --")
        cast = adm["CAST"]["college_id"]
        r = await c.put(f"/api/admin/reference/colleges/{cast}",
                        json={"code":"CASTE","name":adm["CAST"]["name"]}, headers=ADMIN)
        check("re-coding an in-use college -> 409", r.status_code == 409, str(r.status_code))
        check("  and the message says how many", "1 profile(s)" in r.text, r.text[:120])
        r = await c.delete(f"/api/admin/reference/colleges/{cast}", headers=ADMIN)
        check("deleting an in-use college -> 409", r.status_code == 409, str(r.status_code))
        rc = await c.get("/api/admin/reference/colleges", headers=ADMIN)
        check("  and it is still there", "CAST" in [x["code"] for x in rc.json()])

        print("\n-- switching off is always allowed, and is not a delete --")
        r = await c.put(f"/api/admin/reference/colleges/{cast}",
                        json={"code":"CAST","name":adm["CAST"]["name"],"active":False},
                        headers=ADMIN)
        check("PUT active=false -> 200", r.status_code == 200, str(r.status_code))
        check("  name untouched", r.json()["name"] == adm["CAST"]["name"], r.json()["name"])
        r = await c.get("/api/reference/lists", headers=TEACH)
        check("gone from the teacher's dropdown", "CAST" not in [x["code"] for x in r.json()])
        r = await c.get("/api/admin/reference/colleges", headers=ADMIN)
        check("still on the administrator's list", "CAST" in [x["code"] for x in r.json()])
        import asyncpg
        conn = await asyncpg.connect(dsn="postgresql://postgres@/ll?host=" + sys.argv[1] + "&port=55433")
        val = await conn.fetchval("SELECT college FROM user_profiles WHERE user_id=1")
        check("THE TEACHER'S STORED PROFILE IS UNCHANGED", val == "CAST", str(val))
        await conn.close()
        await c.put(f"/api/admin/reference/colleges/{cast}",
                    json={"code":"CAST","name":adm["CAST"]["name"],"active":True}, headers=ADMIN)

        print("\n-- deleting what nothing is using --")
        check("DELETE unused course -> 204",
              (await c.delete(f"/api/admin/reference/courses/{crim}", headers=ADMIN)).status_code == 204)
        check("DELETE unused college -> 204",
              (await c.delete(f"/api/admin/reference/colleges/{ccje}", headers=ADMIN)).status_code == 204)
        r = await c.get("/api/reference/lists", headers=TEACH)
        check("back to 4 colleges", len(r.json()) == 4, str(len(r.json())))
        check("DELETE a college that is not there -> 404",
              (await c.delete(f"/api/admin/reference/colleges/{ccje}", headers=ADMIN)).status_code == 404)

    print(f"\n{ok} ok, {fail} FAIL")
    return 1 if fail else 0

sys.exit(asyncio.run(main()))
