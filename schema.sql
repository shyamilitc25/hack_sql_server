-- Database schema for Hackathon Management System
-- Run this SQL script to create all necessary tables

-- Create database if it doesn't exist
-- CREATE DATABASE IF NOT EXISTS hackathon_db;
-- USE hackathon_db;

-- Admins table for authentication
CREATE TABLE IF NOT EXISTS admins (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Hackathons table
CREATE TABLE IF NOT EXISTS hackathons (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    client_name VARCHAR(255),
    execution_date DATE,
    executed_by VARCHAR(255),
    description TEXT,
    registration_link VARCHAR(500),
    skills_focused TEXT,
    status ENUM('upcoming', 'ongoing', 'completed', 'deleted', 'scheduled') DEFAULT 'scheduled',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Candidates table
CREATE TABLE IF NOT EXISTS candidates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20),
    skills TEXT,
    experience_level ENUM('beginner', 'intermediate', 'advanced') DEFAULT 'beginner',
    hackathon_id INT,
    qr_code VARCHAR(255) UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (hackathon_id) REFERENCES hackathons(id) ON DELETE SET NULL
);

-- Squads table
CREATE TABLE IF NOT EXISTS squads (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    max_members INT DEFAULT 6,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Squad members table (many-to-many relationship)
CREATE TABLE IF NOT EXISTS squad_members (
    id INT AUTO_INCREMENT PRIMARY KEY,
    squad_id INT NOT NULL,
    candidate_id INT NOT NULL,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (squad_id) REFERENCES squads(id) ON DELETE CASCADE,
    FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE,
    UNIQUE KEY unique_squad_member (squad_id, candidate_id)
);

-- Attendance table
CREATE TABLE IF NOT EXISTS attendance (
    id INT AUTO_INCREMENT PRIMARY KEY,
    candidate_id INT NOT NULL,
    check_in_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    check_out_time TIMESTAMP NULL,
    status ENUM('present', 'absent', 'checked_out') DEFAULT 'present',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
);

-- Images table for storing candidate photos
CREATE TABLE IF NOT EXISTS images (
    id INT AUTO_INCREMENT PRIMARY KEY,
    candidate_id INT NOT NULL,
    data LONGBLOB NOT NULL,
    mime_type VARCHAR(50) DEFAULT 'image/jpeg',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
);

-- Insert default admin (username: admin, password: admin123)
-- Password hash is for 'admin123'
INSERT IGNORE INTO admins (username, password_hash) VALUES 
('admin', '$2a$10$rOxP8VQr8J/BnO2k0UNrpOr2oKKn.mKp1QzQzEP5WHBzCVBzuoKci');

-- Sample data for testing (optional)
INSERT IGNORE INTO hackathons (title, client_name, execution_date, executed_by, description, skills_focused, status) VALUES 
('AI Innovation Challenge', 'TechCorp', '2024-12-15', 'John Doe', 'Build innovative AI solutions for real-world problems', 'Python, Machine Learning, AI', 'upcoming'),
('Web Development Sprint', 'StartupXYZ', '2024-11-20', 'Jane Smith', 'Create responsive web applications', 'JavaScript, React, Node.js', 'ongoing'),
('Mobile App Hackathon', 'MobileFirst Inc', '2024-10-30', 'Mike Johnson', 'Develop cross-platform mobile applications', 'Flutter, React Native, Swift', 'completed'),
('Data Science Marathon', 'DataCorp', '2024-10-15', 'Sarah Wilson', 'Analyze complex datasets and create insights', 'Python, R, SQL, Tableau', 'completed');

-- Sample candidates (optional)
INSERT IGNORE INTO candidates (name, email, phone, skills, experience_level, hackathon_id, qr_code) VALUES 
('Alice Johnson', 'alice.johnson@email.com', '+1234567890', 'Python, Machine Learning', 'intermediate', 1, 'QR001'),
('Bob Smith', 'bob.smith@email.com', '+1234567891', 'JavaScript, React', 'advanced', 2, 'QR002'),
('Carol Brown', 'carol.brown@email.com', '+1234567892', 'Flutter, Dart', 'beginner', 3, 'QR003'),
('David Wilson', 'david.wilson@email.com', '+1234567893', 'Python, SQL, Tableau', 'intermediate', 4, 'QR004');

-- Sample squads (optional)
INSERT IGNORE INTO squads (name, description) VALUES 
('Team Alpha', 'Focused on AI and machine learning solutions'),
('Team Beta', 'Web development specialists'),
('Team Gamma', 'Mobile app development experts'),
('Team Delta', 'Data science and analytics team');

-- Sample squad members (optional)
INSERT IGNORE INTO squad_members (squad_id, candidate_id) VALUES 
(1, 1), (2, 2), (3, 3), (4, 4);

-- Sample attendance (optional)
INSERT IGNORE INTO attendance (candidate_id, check_in_time, status) VALUES 
(1, '2024-11-03 09:00:00', 'present'),
(2, '2024-11-03 09:15:00', 'present'),
(3, '2024-11-03 09:30:00', 'present'),
(4, '2024-11-03 09:45:00', 'present');