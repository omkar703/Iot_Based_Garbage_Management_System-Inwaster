import os
import sqlite3
import hashlib
import datetime

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
DEFAULT_DB_PATH = os.path.join(BASE_DIR, 'QRBase.db')

def hash_token(token: str) -> str:
    """Returns SHA-256 hash of a token string."""
    return hashlib.sha256(token.encode('utf-8')).hexdigest()

def get_db_connection(db_path: str = None):
    """Establishes SQLite connection with row factory and foreign key enforcement."""
    target_path = db_path or os.environ.get('DATABASE_PATH', DEFAULT_DB_PATH)
    conn = sqlite3.connect(target_path, timeout=10.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def init_db(db_path: str = None):
    """Initializes tables, indexes, and applies safe backward-compatible migrations."""
    conn = get_db_connection(db_path)
    cur = conn.cursor()

    # 1. Users Table
    cur.execute('''
        CREATE TABLE IF NOT EXISTS users (
            mail TEXT PRIMARY KEY,
            passwd TEXT NOT NULL,
            name TEXT,
            role TEXT DEFAULT 'user',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    ''')

    # Migrations for users table
    cur.execute("PRAGMA table_info(users)")
    cols = [col['name'] for col in cur.fetchall()]
    if 'name' not in cols:
        cur.execute("ALTER TABLE users ADD COLUMN name TEXT")
    if 'role' not in cols:
        cur.execute("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'")
    if 'created_at' not in cols:
        cur.execute("ALTER TABLE users ADD COLUMN created_at TIMESTAMP")

    # 2. Access Log Table (legacy compatibility)
    cur.execute('''
        CREATE TABLE IF NOT EXISTS access_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mail TEXT NOT NULL,
            key INTEGER NOT NULL,
            counter INTEGER NOT NULL DEFAULT 1,
            updated_at TIMESTAMP
        );
    ''')
    cur.execute("PRAGMA table_info(access_log)")
    log_cols = [col['name'] for col in cur.fetchall()]
    if 'updated_at' not in log_cols:
        cur.execute("ALTER TABLE access_log ADD COLUMN updated_at TIMESTAMP")

    # 3. Bins Table (Smart Dustbin Fleet)
    cur.execute('''
        CREATE TABLE IF NOT EXISTS bins (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            location TEXT NOT NULL,
            device_token_hash TEXT NOT NULL,
            status TEXT DEFAULT 'AVAILABLE',
            fill_percentage REAL DEFAULT 0.0,
            last_distance_cm REAL DEFAULT 0.0,
            total_weight_kg REAL DEFAULT 0.0,
            total_deposits INTEGER DEFAULT 0,
            battery_percentage INTEGER DEFAULT 100,
            empty_distance_cm REAL DEFAULT 100.0,
            full_distance_cm REAL DEFAULT 15.0,
            max_weight_capacity_kg REAL DEFAULT 25.0,
            last_heartbeat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    ''')

    # 4. Deposit Sessions Table (State Machine & Ephemeral Claims)
    cur.execute('''
        CREATE TABLE IF NOT EXISTS deposit_sessions (
            id TEXT PRIMARY KEY,
            bin_id TEXT NOT NULL,
            state TEXT NOT NULL,
            weight_grams REAL DEFAULT 0.0,
            weight_stable INTEGER DEFAULT 0,
            fill_percent_at_deposit REAL DEFAULT 0.0,
            claim_token_hash TEXT UNIQUE,
            claim_token_expires_at TIMESTAMP,
            claimed_by_mail TEXT,
            claimed_at TIMESTAMP,
            points_awarded INTEGER DEFAULT 0,
            failure_reason TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (bin_id) REFERENCES bins(id),
            FOREIGN KEY (claimed_by_mail) REFERENCES users(mail)
        );
    ''')
    cur.execute("CREATE INDEX IF NOT EXISTS idx_sessions_bin ON deposit_sessions(bin_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_sessions_claim_token ON deposit_sessions(claim_token_hash);")

    # 5. Points Ledger Table (Atomic Auditable Ledger)
    cur.execute('''
        CREATE TABLE IF NOT EXISTS points_ledger (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_mail TEXT NOT NULL,
            delta INTEGER NOT NULL,
            balance_after INTEGER NOT NULL,
            source_type TEXT NOT NULL,
            source_ref TEXT,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_mail) REFERENCES users(mail)
        );
    ''')
    cur.execute("CREATE INDEX IF NOT EXISTS idx_ledger_user ON points_ledger(user_mail);")

    # 6. Partners Table (Configured Sustainable Partners)
    cur.execute('''
        CREATE TABLE IF NOT EXISTS partners (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            description TEXT,
            logo_url TEXT,
            website TEXT,
            is_active INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    ''')

    # 7. Coupons Table (Partner Rewards Offers)
    cur.execute('''
        CREATE TABLE IF NOT EXISTS coupons (
            id TEXT PRIMARY KEY,
            partner_id TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            terms TEXT NOT NULL,
            points_cost INTEGER NOT NULL,
            discount_value TEXT NOT NULL,
            inventory_remaining INTEGER NOT NULL DEFAULT 100,
            is_active INTEGER DEFAULT 1,
            expires_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (partner_id) REFERENCES partners(id)
        );
    ''')
    cur.execute("CREATE INDEX IF NOT EXISTS idx_coupons_partner ON coupons(partner_id);")

    # 8. Redemptions Table (Vouchers Claimed by Users)
    cur.execute('''
        CREATE TABLE IF NOT EXISTS redemptions (
            id TEXT PRIMARY KEY,
            user_mail TEXT NOT NULL,
            coupon_id TEXT NOT NULL,
            points_spent INTEGER NOT NULL,
            voucher_code TEXT UNIQUE NOT NULL,
            status TEXT DEFAULT 'ACTIVE',
            expires_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_mail) REFERENCES users(mail),
            FOREIGN KEY (coupon_id) REFERENCES coupons(id)
        );
    ''')
    cur.execute("CREATE INDEX IF NOT EXISTS idx_redemptions_user ON redemptions(user_mail);")

    conn.commit()

    # Seed Default Bins, Partners, and Coupons if empty
    _seed_initial_data(cur)
    conn.commit()

    # Sync legacy access_log into points_ledger if points_ledger has 0 records
    _sync_legacy_scores(cur)
    conn.commit()

    conn.close()

def _seed_initial_data(cur):
    """Populates standard campus smart bins, partner businesses, and coupons."""
    # Bins
    cur.execute("SELECT COUNT(*) FROM bins")
    if cur.fetchone()[0] == 0:
        default_dev_token = "inwaster_dev_token_vit01_2026"
        token_hash = hash_token(default_dev_token)
        bins = [
            (
                "BIN-VIT-01",
                "Central Cafeteria Smart Bin",
                "VIT Bhopal Campus - Food Court Area",
                token_hash,
                "AVAILABLE",
                32.5,
                67.5,
                4.2,
                18,
                94,
                100.0,
                15.0,
                25.0
            ),
            (
                "BIN-VIT-02",
                "Academic Block 1 Entrance",
                "VIT Bhopal Campus - AB-1 Foyer",
                token_hash,
                "AVAILABLE",
                18.0,
                82.0,
                2.1,
                9,
                89,
                100.0,
                15.0,
                25.0
            ),
            (
                "BIN-VIT-03",
                "Library Commons EcoStation",
                "VIT Bhopal Campus - Central Library Lawn",
                token_hash,
                "NEARLY_FULL",
                78.0,
                22.0,
                16.5,
                42,
                76,
                100.0,
                15.0,
                25.0
            )
        ]
        cur.executemany('''
            INSERT INTO bins (
                id, name, location, device_token_hash, status, fill_percentage,
                last_distance_cm, total_weight_kg, total_deposits, battery_percentage,
                empty_distance_cm, full_distance_cm, max_weight_capacity_kg
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', bins)

    # Partners
    cur.execute("SELECT COUNT(*) FROM partners")
    if cur.fetchone()[0] == 0:
        partners = [
            ("PARTNER-01", "Campus Cafeteria", "Cafeteria & Dining", "University central cafeteria offering fresh meals, snacks, and juices.", "/static/assets/images/services/business.jpg", "https://cafeteria.campus.edu"),
            ("PARTNER-02", "Green Bean Coffee", "Beverages & Cafes", "Ethically sourced artisan coffee and baked pastries on campus.", "/static/assets/images/services/finance.jpg", "https://greenbean.coffee"),
            ("PARTNER-03", "Campus University Bookstore", "Books & Stationery", "Official campus books, notebooks, recycled pens, and tech accessories.", "/static/assets/images/services/software.jpg", "https://bookstore.campus.edu"),
            ("PARTNER-04", "EcoEssentials Campus Mart", "Eco Store & Grocery", "Zero-waste daily essentials, bamboo toothbrushes, and healthy snacks.", "/static/assets/images/services/types-of-waste.jpg", "https://ecoessentials.store")
        ]
        cur.executemany('''
            INSERT INTO partners (id, name, category, description, logo_url, website)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', partners)

    # Coupons
    cur.execute("SELECT COUNT(*) FROM coupons")
    if cur.fetchone()[0] == 0:
        expiry = (datetime.datetime.utcnow() + datetime.timedelta(days=90)).strftime('%Y-%m-%d %H:%M:%S')
        coupons = [
            (
                "COUPON-01",
                "PARTNER-01",
                "₹30 Off Lunch or Snack Combo",
                "Enjoy ₹30 off on any meal above ₹100 at the main cafeteria.",
                "Valid for single use per transaction. Cannot be combined with other offers.",
                30,
                "₹30 OFF",
                150,
                1,
                expiry
            ),
            (
                "COUPON-02",
                "PARTNER-02",
                "Free Brewed Iced Coffee Upgrade",
                "Complimentary size upgrade on any cold coffee or matcha beverage.",
                "Valid between 8 AM and 6 PM on weekdays. One per customer per day.",
                20,
                "FREE UPGRADE",
                80,
                1,
                expiry
            ),
            (
                "COUPON-03",
                "PARTNER-03",
                "15% Off Recycled Paper Notebooks",
                "Get 15% discount on all eco-friendly notebook packs and stationery.",
                "Valid at campus bookstore on all recycled paper products.",
                40,
                "15% OFF",
                60,
                1,
                expiry
            ),
            (
                "COUPON-04",
                "PARTNER-04",
                "₹50 Off Zero-Waste Bamboo Kit",
                "Get ₹50 discount on stainless steel cutlery, bottles, or bamboo toothbrushes.",
                "Minimum purchase of ₹150 required. Subject to store stock.",
                50,
                "₹50 OFF",
                45,
                1,
                expiry
            )
        ]
        cur.executemany('''
            INSERT INTO coupons (
                id, partner_id, title, description, terms, points_cost,
                discount_value, inventory_remaining, is_active, expires_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', coupons)

def _sync_legacy_scores(cur):
    """Synchronizes any pre-existing access_log scores into points_ledger."""
    cur.execute("SELECT COUNT(*) FROM points_ledger")
    if cur.fetchone()[0] == 0:
        cur.execute("SELECT mail, key, counter, updated_at FROM access_log")
        records = cur.fetchall()
        user_balances = {}
        for r in records:
            mail = r['mail']
            key = r['key']
            count = r['counter']
            timestamp = r['updated_at'] or datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
            pts_per_scan = key if (1 <= key <= 100) else 10
            total_earned = pts_per_scan * count
            curr_bal = user_balances.get(mail, 0) + total_earned
            user_balances[mail] = curr_bal

            cur.execute('''
                INSERT INTO points_ledger (user_mail, delta, balance_after, source_type, source_ref, description, created_at)
                VALUES (?, ?, ?, 'LEGACY_SYNC', ?, ?, ?)
            ''', (mail, total_earned, curr_bal, f"KEY-{key}", f"Legacy recycling score sync ({count} scans)", timestamp))
