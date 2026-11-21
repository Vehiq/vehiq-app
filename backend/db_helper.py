"""Database holder for shared access by routers."""

_db = None

def set_db(database):
    global _db
    _db = database

def get_db():
    return _db
