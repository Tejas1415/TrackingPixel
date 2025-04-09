// server.js - Express server for image tracking
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const geoip = require('geoip-lite');
const useragent = require('express-useragent');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.static('public'));
app.use(express.json());
app.use(useragent.express());

// Set up storage for uploaded images
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, uuidv4() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// Database simulation (in a real app, use MongoDB, PostgreSQL, etc.)
const trackingDB = {};

// Routes
app.post('/api/upload', upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No image uploaded' });
    }

    const trackingId = uuidv4();
    const imageUrl = `/track/${trackingId}`;
    
    // Store tracking information
    trackingDB[trackingId] = {
        originalImage: req.file.path,
        trackingUrl: imageUrl,
        views: [],
        createdAt: new Date()
    };
    
    res.json({
        success: true,
        trackingId: trackingId,
        trackingUrl: `${req.protocol}://${req.get('host')}${imageUrl}`
    });
});

// Endpoint that serves the tracking image
app.get('/track/:id', (req, res) => {
    const trackingId = req.params.id;
    const tracking = trackingDB[trackingId];
    
    if (!tracking) {
        return res.status(404).send('Image not found');
    }
    
    // Log the visit
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const geo = geoip.lookup(ip) || { country: 'Unknown', region: 'Unknown', city: 'Unknown' };
    const userAgentData = req.useragent;
    
    const visitData = {
        timestamp: new Date(),
        ip: ip,
        location: `${geo.city}, ${geo.region}, ${geo.country}`,
        device: `${userAgentData.browser} on ${userAgentData.os}`,
        referrer: req.get('Referrer') || 'Direct'
    };
    
    tracking.views.push(visitData);
    
    // Send the image
    res.sendFile(path.resolve(tracking.originalImage));
});

// Get tracking data
app.get('/api/tracking/:id', (req, res) => {
    const trackingId = req.params.id;
    const tracking = trackingDB[trackingId];
    
    if (!tracking) {
        return res.status(404).json({ error: 'Tracking ID not found' });
    }
    
    res.json({
        trackingId: trackingId,
        views: tracking.views,
        createdAt: tracking.createdAt
    });
});

// Ensure uploads directory exists
if (!fs.existsSync('uploads/')) {
    fs.mkdirSync('uploads/');
}

app.listen(port, () => {
    console.log(`Tracking server running on port ${port}`);
});