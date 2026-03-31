const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DEFAULT_DB_PATH = path.join(__dirname, '../../database/ecowaste.db');
const DB_PATH = path.resolve(process.env.DATABASE_PATH || DEFAULT_DB_PATH);

let db;

function getDb() {
    if (!db) {
        fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
        db = new Database(DB_PATH, { verbose: null });
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
    }
    return db;
}

function initializeDb() {
    const database = getDb();

    database.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            phone TEXT,
            address TEXT,
            role TEXT DEFAULT 'user' CHECK(role IN ('user','admin','driver')),
            avatar TEXT,
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS waste_types (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            category TEXT NOT NULL CHECK(category IN ('biodegradable','recyclable','hazardous','general')),
            description TEXT,
            icon TEXT,
            color TEXT,
            handling_instructions TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS vehicles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vehicle_number TEXT UNIQUE NOT NULL,
            vehicle_type TEXT,
            capacity_kg REAL,
            driver_id INTEGER,
            status TEXT DEFAULT 'available' CHECK(status IN ('available','on_route','maintenance','inactive')),
            current_location TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (driver_id) REFERENCES users(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS pickup_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_number TEXT UNIQUE NOT NULL,
            user_id INTEGER NOT NULL,
            waste_type_id INTEGER,
            waste_description TEXT,
            quantity_kg REAL,
            pickup_address TEXT NOT NULL,
            preferred_date TEXT NOT NULL,
            preferred_time_slot TEXT DEFAULT 'morning',
            status TEXT DEFAULT 'pending',
            priority TEXT DEFAULT 'normal',
            assigned_vehicle_id INTEGER,
            assigned_driver_id INTEGER,
            notes TEXT,
            admin_notes TEXT,
            estimated_pickup_time TEXT,
            actual_pickup_time TEXT,
            rating INTEGER,
            feedback TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (waste_type_id) REFERENCES waste_types(id) ON DELETE SET NULL,
            FOREIGN KEY (assigned_vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS status_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_id INTEGER NOT NULL,
            old_status TEXT,
            new_status TEXT NOT NULL,
            changed_by INTEGER,
            notes TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (request_id) REFERENCES pickup_requests(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            type TEXT DEFAULT 'info',
            is_read INTEGER DEFAULT 0,
            related_request_id INTEGER,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    `);

    // Seed data only if empty
    const userCount = database.prepare('SELECT COUNT(*) as c FROM users').get().c;
    if (userCount === 0) {
        const adminHash  = bcrypt.hashSync('Admin@123', 12);
        const driverHash = bcrypt.hashSync('Admin@123', 12);

        database.prepare(`INSERT INTO users (name,email,password,role,phone,address) VALUES (?,?,?,?,?,?)`).run(
            'System Admin','admin@wastems.com', adminHash,'admin','9876543210','EcoWaste HQ, City Center'
        );
        database.prepare(`INSERT INTO users (name,email,password,role,phone,address) VALUES (?,?,?,?,?,?)`).run(
            'John Driver','driver@wastems.com', driverHash,'driver','9876543211','Driver Colony, North Zone'
        );

        const wasteTypes = [
            ['Kitchen Waste','biodegradable','Food scraps, vegetable peels, cooked food leftovers','🍃','#4CAF50','Store in Green bin. Can be composted.'],
            ['Garden Waste','biodegradable','Leaves, grass clippings, plant trimmings','🌿','#66BB6A','Bundle large branches. Place in Green bin.'],
            ['Paper & Cardboard','recyclable','Newspapers, cardboard boxes, office paper','📰','#2196F3','Keep dry. Flatten cardboard. Place in Blue bin.'],
            ['Plastic Waste','recyclable','Bottles, containers, packaging materials','♻️','#03A9F4','Rinse containers. Crush bottles. Place in Blue bin.'],
            ['Glass Waste','recyclable','Bottles, jars, broken glass','🫙','#00BCD4','Wrap broken glass in newspaper. Place in Blue bin.'],
            ['Electronic Waste','hazardous','Old phones, computers, batteries, cables','💻','#FF5722','Do not break. Special collection required.'],
            ['Medical Waste','hazardous','Expired medicines, syringes, medical equipment','💊','#F44336','Seal in puncture-proof container.'],
            ['Chemical Waste','hazardous','Paint, solvents, cleaning chemicals','⚗️','#FF9800','Never mix chemicals. Keep in original containers.'],
            ['Mixed General Waste','general','Non-recyclable, non-hazardous mixed waste','🗑️','#9E9E9E','Place in Black bin.'],
        ];
        const insertWt = database.prepare('INSERT INTO waste_types (name,category,description,icon,color,handling_instructions) VALUES (?,?,?,?,?,?)');
        wasteTypes.forEach(wt => insertWt.run(...wt));

        const vehicles = [
            ['WM-TRK-001','Heavy Truck',5000,1,'available'],
            ['WM-VAN-002','Collection Van',1500,null,'available'],
            ['WM-TRK-003','Medium Truck',3000,null,'available'],
            ['WM-SPL-004','Hazmat Truck',2000,null,'maintenance'],
        ];
        const insertV = database.prepare('INSERT INTO vehicles (vehicle_number,vehicle_type,capacity_kg,driver_id,status) VALUES (?,?,?,?,?)');
        vehicles.forEach(v => insertV.run(...v));

        console.log('✅ Database seeded with default data');
    }

    console.log('✅ SQLite Database ready at:', DB_PATH);
    return true;
}

// Promise-based wrappers that mimic mysql2 API for compatibility
const pool = {
    async execute(sql, params = []) {
        const database = getDb();
        const normalized = sql.replace(/\?/g, () => '?');
        
        const trimmed = sql.trim().toUpperCase();
        if (trimmed.startsWith('SELECT') || trimmed.startsWith('SHOW')) {
            const stmt = database.prepare(sql);
            const rows = stmt.all(...params);
            return [rows, []];
        } else {
            const stmt = database.prepare(sql);
            const info = stmt.run(...params);
            return [{ insertId: info.lastInsertRowid, affectedRows: info.changes }, []];
        }
    }
};

async function testConnection() {
    try {
        initializeDb();
        return true;
    } catch (err) {
        console.error('Database init error:', err.message);
        return false;
    }
}

module.exports = { pool, testConnection };
