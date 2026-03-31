-- ============================================
-- Waste Management System - Database Schema
-- ============================================

CREATE DATABASE IF NOT EXISTS waste_management;
USE waste_management;

-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    address TEXT,
    role ENUM('user', 'admin', 'driver') DEFAULT 'user',
    avatar VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    email_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Waste Types Table
CREATE TABLE IF NOT EXISTS waste_types (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    category ENUM('biodegradable', 'recyclable', 'hazardous', 'general') NOT NULL,
    description TEXT,
    icon VARCHAR(50),
    color VARCHAR(20),
    handling_instructions TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Vehicles Table
CREATE TABLE IF NOT EXISTS vehicles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    vehicle_number VARCHAR(50) UNIQUE NOT NULL,
    vehicle_type VARCHAR(100),
    capacity_kg DECIMAL(10,2),
    driver_id INT,
    status ENUM('available', 'on_route', 'maintenance', 'inactive') DEFAULT 'available',
    current_location VARCHAR(255),
    last_service_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (driver_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Pickup Requests Table
CREATE TABLE IF NOT EXISTS pickup_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    request_number VARCHAR(50) UNIQUE NOT NULL,
    user_id INT NOT NULL,
    waste_type_id INT,
    waste_description TEXT,
    quantity_kg DECIMAL(10,2),
    pickup_address TEXT NOT NULL,
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    preferred_date DATE NOT NULL,
    preferred_time_slot ENUM('morning', 'afternoon', 'evening') DEFAULT 'morning',
    status ENUM('pending', 'confirmed', 'assigned', 'in_progress', 'completed', 'cancelled') DEFAULT 'pending',
    priority ENUM('low', 'normal', 'high', 'urgent') DEFAULT 'normal',
    assigned_vehicle_id INT,
    assigned_driver_id INT,
    notes TEXT,
    admin_notes TEXT,
    estimated_pickup_time DATETIME,
    actual_pickup_time DATETIME,
    completion_photo VARCHAR(255),
    rating INT CHECK (rating BETWEEN 1 AND 5),
    feedback TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (waste_type_id) REFERENCES waste_types(id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_driver_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Status History Table
CREATE TABLE IF NOT EXISTS status_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    request_id INT NOT NULL,
    old_status VARCHAR(50),
    new_status VARCHAR(50) NOT NULL,
    changed_by INT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (request_id) REFERENCES pickup_requests(id) ON DELETE CASCADE,
    FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type ENUM('info', 'success', 'warning', 'error') DEFAULT 'info',
    is_read BOOLEAN DEFAULT FALSE,
    related_request_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (related_request_id) REFERENCES pickup_requests(id) ON DELETE SET NULL
);

-- Disposal Sites Table
CREATE TABLE IF NOT EXISTS disposal_sites (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    site_type ENUM('landfill', 'recycling_center', 'compost', 'hazardous_waste') NOT NULL,
    capacity_tons DECIMAL(10,2),
    current_usage_percent DECIMAL(5,2),
    contact_phone VARCHAR(20),
    operating_hours VARCHAR(100),
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Analytics / Reports Table
CREATE TABLE IF NOT EXISTS collection_reports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    report_date DATE NOT NULL,
    total_requests INT DEFAULT 0,
    completed_requests INT DEFAULT 0,
    total_waste_kg DECIMAL(10,2) DEFAULT 0,
    biodegradable_kg DECIMAL(10,2) DEFAULT 0,
    recyclable_kg DECIMAL(10,2) DEFAULT 0,
    hazardous_kg DECIMAL(10,2) DEFAULT 0,
    vehicles_deployed INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- Seed Data
-- ============================================

-- Default Admin User (password: Admin@123)
INSERT INTO users (name, email, password, role, phone, address) VALUES
('System Admin', 'admin@wastems.com', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4J/HS.iK8e', 'admin', '9876543210', 'Waste Management HQ, City Center'),
('John Driver', 'driver@wastems.com', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4J/HS.iK8e', 'driver', '9876543211', 'Driver Colony, North Zone');

-- Waste Types
INSERT INTO waste_types (name, category, description, icon, color, handling_instructions) VALUES
('Kitchen Waste', 'biodegradable', 'Food scraps, vegetable peels, cooked food leftovers', '🍃', '#4CAF50', 'Store in Green bin. Can be composted.'),
('Garden Waste', 'biodegradable', 'Leaves, grass clippings, plant trimmings', '🌿', '#66BB6A', 'Bundle large branches. Place in Green bin.'),
('Paper & Cardboard', 'recyclable', 'Newspapers, cardboard boxes, office paper', '📰', '#2196F3', 'Keep dry. Flatten cardboard boxes. Place in Blue bin.'),
('Plastic Waste', 'recyclable', 'Bottles, containers, packaging materials', '♻️', '#03A9F4', 'Rinse containers. Crush bottles. Place in Blue bin.'),
('Glass Waste', 'recyclable', 'Bottles, jars, broken glass', '🫙', '#00BCD4', 'Wrap broken glass in newspaper. Place in Blue bin.'),
('Electronic Waste', 'hazardous', 'Old phones, computers, batteries, cables', '💻', '#FF5722', 'Do not break. Handle with care. Special collection required.'),
('Medical Waste', 'hazardous', 'Expired medicines, syringes, medical equipment', '💊', '#F44336', 'Seal in puncture-proof container. Special handling required.'),
('Chemical Waste', 'hazardous', 'Paint, solvents, cleaning chemicals', '⚗️', '#FF9800', 'Never mix chemicals. Keep in original containers.'),
('Mixed General Waste', 'general', 'Non-recyclable, non-hazardous mixed waste', '🗑️', '#9E9E9E', 'Place in Black bin. Try to minimize this category.');

-- Vehicles
INSERT INTO vehicles (vehicle_number, vehicle_type, capacity_kg, driver_id, status) VALUES
('WM-TRK-001', 'Heavy Truck', 5000.00, 2, 'available'),
('WM-VAN-002', 'Collection Van', 1500.00, NULL, 'available'),
('WM-TRK-003', 'Medium Truck', 3000.00, NULL, 'available'),
('WM-SPL-004', 'Hazmat Truck', 2000.00, NULL, 'maintenance');

-- Disposal Sites
INSERT INTO disposal_sites (name, address, site_type, capacity_tons, current_usage_percent, operating_hours) VALUES
('City Recycling Center', 'Industrial Area, Zone A', 'recycling_center', 10000.00, 45.5, '6:00 AM - 6:00 PM'),
('Green Compost Facility', 'East Green Belt', 'compost', 5000.00, 30.0, '7:00 AM - 5:00 PM'),
('Main Sanitary Landfill', 'Outskirts, Highway 12', 'landfill', 50000.00, 65.0, '24/7'),
('Hazardous Waste Treatment', 'Special Industrial Zone', 'hazardous_waste', 2000.00, 15.0, '8:00 AM - 4:00 PM');
