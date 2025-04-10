// simpler-server.js - Minimal server with explicit error handling
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const os = require('os');
const geoip = require('geoip-lite');
const ipaddr = require('ipaddr.js');

const app = express();
const port = process.env.PORT || 5050;

// Function to get local IP addresses
function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  
  return addresses;
}

// Function to parse user agent string and extract browser and OS
function parseBrowser(userAgent) {
  const ua = userAgent.toLowerCase();
  let browserInfo = "";
  
  // Browser detection
  if (ua.includes("edg/") || ua.includes("edge/")) {
    browserInfo = "Microsoft Edge";
  } else if (ua.includes("chrome/") && !ua.includes("chromium/")) {
    if (ua.includes("brave")) {
      browserInfo = "Brave";
    } else {
      browserInfo = "Google Chrome";
    }
  } else if (ua.includes("firefox/")) {
    browserInfo = "Mozilla Firefox";
  } else if (ua.includes("safari/") && !ua.includes("chrome/")) {
    browserInfo = "Safari";
  } else if (ua.includes("opr/") || ua.includes("opera/")) {
    browserInfo = "Opera";
  } else {
    browserInfo = "Unknown Browser";
  }
  
  // Add device type info
  if (ua.includes("mobile")) {
    browserInfo += " (Mobile)";
  } else if (ua.includes("tablet")) {
    browserInfo += " (Tablet)";
  } else {
    browserInfo += " (Desktop)";
  }
  
  return browserInfo;
}

// Function to extract OS information
function parseOS(userAgent) {
  const ua = userAgent.toLowerCase();
  
  // OS detection
  if (ua.includes("windows")) {
    return ua.includes("windows nt 10") ? "Windows 10/11" : 
           ua.includes("windows nt 6.3") ? "Windows 8.1" :
           ua.includes("windows nt 6.2") ? "Windows 8" :
           ua.includes("windows nt 6.1") ? "Windows 7" :
           "Windows (Other)";
  } else if (ua.includes("macintosh") || ua.includes("mac os x")) {
    return "macOS";
  } else if (ua.includes("android")) {
    return "Android";
  } else if (ua.includes("ios") || ua.includes("iphone") || ua.includes("ipad")) {
    return "iOS";
  } else if (ua.includes("linux")) {
    return "Linux";
  } else {
    return "Unknown OS";
  }
}

// Enable detailed logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Middleware
app.use(express.static('public'));
app.use(express.json());

// Make the uploads directory accessible
app.use('/uploads', express.static('uploads'));

// Set up multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    console.log('Handling file upload to uploads directory');
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueId = uuidv4();
    const extension = path.extname(file.originalname);
    console.log(`Generated filename: ${uniqueId}${extension}`);
    cb(null, `${uniqueId}${extension}`);
  }
});

// File filter to validate images
const fileFilter = (req, file, cb) => {
  // Accept only image files
  if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/i)) {
    return cb(new Error('Only image files are allowed!'), false);
  }
  
  // Validate mime type
  if (!file.mimetype.startsWith('image/')) {
    return cb(new Error('File must be an image'), false);
  }
  
  cb(null, true);
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB file size limit
  }
});

// Error handler for multer errors
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    console.error('Multer error:', err);
    return res.status(400).json({ success: false, error: `Upload error: ${err.message}` });
  } else if (err) {
    console.error('Other error during upload:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
  next();
});

// In-memory database
const trackingDB = {};

// Upload route
app.post('/api/upload', upload.single('image'), (req, res) => {
  console.log('Processing upload request');
  
  if (!req.file) {
    console.log('No file uploaded');
    return res.status(400).json({ success: false, error: 'No image uploaded' });
  }
  
  try {
    const trackingId = path.basename(req.file.filename, path.extname(req.file.filename));
    const imagePath = req.file.path;
    const imageUrl = `/uploads/${req.file.filename}`;
    
    console.log(`File saved at: ${imagePath}`);
    console.log(`Image URL: ${imageUrl}`);
    console.log(`Tracking ID: ${trackingId}`);
    
    // Verify the file exists on disk
    if (!fs.existsSync(imagePath)) {
      throw new Error(`File not found at path: ${imagePath}`);
    }
    
    // Store tracking information
    trackingDB[trackingId] = {
      imagePath: imagePath,
      imageUrl: imageUrl,
      views: [],
      createdAt: new Date()
    };
    
    // Check file is accessible before returning success
    fs.accessSync(imagePath, fs.constants.R_OK);
    
    return res.json({
      success: true,
      trackingId: trackingId,
      imageUrl: imageUrl
    });
  } catch (error) {
    console.error('Error in upload handler:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Track image views - this happens when the static file is accessed
app.get('/track-view/:id', async (req, res) => {
  const trackingId = req.params.id;
  console.log(`Tracking view for ID: ${trackingId}`);
  
  const tracking = trackingDB[trackingId];
  
  if (!tracking) {
    return res.status(404).json({ error: 'Tracking ID not found' });
  }
  
  // Log all available info
  const clientIp = req.headers['x-forwarded-for'] || 
                  req.headers['cf-connecting-ip'] || 
                  req.headers['x-real-ip'] || 
                  req.connection.remoteAddress || 'Unknown';
  const rawUserAgent = req.headers['user-agent'] || 'Unknown';
  const userAgent = parseBrowser(rawUserAgent);
  const operatingSystem = parseOS(rawUserAgent);
  const language = req.headers['accept-language'] || 'Unknown';
  const referrer = req.headers.referer || 'Direct';
  
  // Get detailed IP geolocation
  const geoInfo = await getIPGeolocation(clientIp);
  
  const viewData = {
    timestamp: new Date(),
    ip: clientIp,
    ipInfo: {
      version: geoInfo.ipVersion || 'Unknown',
      networkType: geoInfo.networkType || 'Unknown',
      provider: geoInfo.org || 'Unknown'
    },
    userAgent: userAgent,
    rawUserAgent: rawUserAgent,
    operatingSystem: operatingSystem,
    language: language,
    country: geoInfo.country,
    city: geoInfo.city,
    region: geoInfo.region,
    loc: geoInfo.loc,
    timezone: geoInfo.timezone,
    referrer: referrer,
    source: 'Website View',
    headers: Object.keys(req.headers).reduce((obj, key) => {
      // Filter out some sensitive headers
      if (!['cookie', 'authorization'].includes(key.toLowerCase())) {
        obj[key] = req.headers[key];
      }
      return obj;
    }, {})
  };
  
  tracking.views.push(viewData);
  console.log(`Recorded view from ${clientIp} using ${userAgent} on ${operatingSystem}`);
  
  // Return a tiny transparent GIF
  const transparentGif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  res.set('Content-Type', 'image/gif');
  res.send(transparentGif);
});

// Get tracking data
app.get('/api/tracking/:id', (req, res) => {
  const trackingId = req.params.id;
  console.log(`Retrieving tracking data for ID: ${trackingId}`);
  
  const tracking = trackingDB[trackingId];
  
  if (!tracking) {
    return res.status(404).json({ success: false, error: 'Tracking ID not found' });
  }
  
  return res.json({
    success: true,
    trackingId: trackingId,
    views: tracking.views,
    createdAt: tracking.createdAt
  });
});

// Shareable landing page with tracking
app.get('/view/:id', (req, res) => {
  const trackingId = req.params.id;
  console.log(`Generating landing page for ID: ${trackingId}`);
  
  const tracking = trackingDB[trackingId];
  
  if (!tracking) {
    return res.status(404).send('Image not found');
  }
  
  // We'll rely on the tracking pixel for tracking, so no need to log here
  // This prevents duplicate entries
  
  // Generate HTML for landing page with tracking pixel and enhanced browser detection
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Shared Image</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; text-align: center; }
        img { max-width: 100%; border: 1px solid #ddd; margin: 20px 0; }
      </style>
      <script>
        // Enhanced browser detection script
        window.onload = function() {
          // Gather browser and system information
          const browserData = {
            screenWidth: window.screen.width,
            screenHeight: window.screen.height,
            colorDepth: window.screen.colorDepth,
            devicePixelRatio: window.devicePixelRatio,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            language: navigator.language || navigator.userLanguage,
            platformDetails: navigator.platform,
            cookiesEnabled: navigator.cookieEnabled,
            doNotTrack: navigator.doNotTrack,
            connectionType: navigator.connection ? navigator.connection.effectiveType : 'unknown',
            deviceMemory: navigator.deviceMemory ? navigator.deviceMemory + 'GB' : 'unknown',
            hardwareConcurrency: navigator.hardwareConcurrency || 'unknown',
            plugins: Array.from(navigator.plugins || []).map(p => p.name).join(', ') || 'none'
          };
          
          // Send data to server
          fetch('/enhanced-tracking/${trackingId}', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(browserData)
          });
          
          // Detect Brave browser specifically
          if (navigator.brave && navigator.brave.isBrave) {
            navigator.brave.isBrave().then(isBrave => {
              if (isBrave) {
                fetch('/update-browser/${trackingId}?browser=Brave');
              }
            });
          }
        }
      </script>
    </head>
    <body>
      <h1>Check out this image!</h1>
      <img src="${tracking.imageUrl}" alt="Shared image" />
      <img src="/track-view/${trackingId}" style="display:none" />
      <p>Thanks for viewing!</p>
    </body>
    </html>
  `;
  
  res.send(html);
});

// Add endpoint to update browser info
app.get('/update-browser/:id', async (req, res) => {
  const trackingId = req.params.id;
  const browserName = req.query.browser;
  const clientIp = req.headers['x-forwarded-for'] || 
                  req.headers['cf-connecting-ip'] || 
                  req.headers['x-real-ip'] || 
                  req.connection.remoteAddress || 'Unknown';
  
  if (trackingDB[trackingId] && browserName) {
    // Find the view for this tracking ID that matches the current IP
    const views = trackingDB[trackingId].views;
    if (views.length > 0) {
      // First look for a matching IP address from recent views (last 5 minutes)
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      
      // Find the most recent view from this IP
      const recentViews = views.filter(view => 
        view.ip === clientIp && 
        new Date(view.timestamp) > fiveMinutesAgo
      );
      
      if (recentViews.length > 0) {
        // Sort by timestamp descending and get the most recent one
        const latestView = recentViews.sort((a, b) => 
          new Date(b.timestamp) - new Date(a.timestamp)
        )[0];
        
        // Update the browser info
        latestView.userAgent = browserName + (latestView.userAgent.includes('(Desktop)') ? ' (Desktop)' : 
                                            latestView.userAgent.includes('(Mobile)') ? ' (Mobile)' : 
                                            latestView.userAgent.includes('(Tablet)') ? ' (Tablet)' : '');
        
        console.log(`Updated browser info for IP ${clientIp} to ${browserName}`);
      }
    }
  }
  
  // Return a tiny transparent GIF
  const transparentGif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  res.set('Content-Type', 'image/gif');
  res.send(transparentGif);
});

// Add endpoint for enhanced tracking data from JavaScript
app.post('/enhanced-tracking/:id', express.json(), (req, res) => {
  const trackingId = req.params.id;
  const browserData = req.body;
  const clientIp = req.headers['x-forwarded-for'] || 
                  req.headers['cf-connecting-ip'] || 
                  req.headers['x-real-ip'] || 
                  req.connection.remoteAddress || 'Unknown';
  
  console.log(`Received enhanced tracking data for ID: ${trackingId} from IP: ${clientIp}`);
  
  if (trackingDB[trackingId]) {
    // Find the most recent view from this IP
    const views = trackingDB[trackingId].views;
    if (views.length > 0) {
      // Look for a matching record in the last 5 minutes
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      
      const recentViews = views.filter(view => 
        view.ip === clientIp && 
        new Date(view.timestamp) > fiveMinutesAgo
      );
      
      if (recentViews.length > 0) {
        // Sort by timestamp descending and get the most recent one
        const latestView = recentViews.sort((a, b) => 
          new Date(b.timestamp) - new Date(a.timestamp)
        )[0];
        
        // Add enhanced data
        latestView.enhanced = browserData;
        
        // Get better screen information
        if (browserData.screenWidth && browserData.screenHeight) {
          latestView.screenResolution = `${browserData.screenWidth}×${browserData.screenHeight}`;
        }
        
        // Get timezone information
        if (browserData.timezone) {
          latestView.timezone = browserData.timezone;
        }
        
        console.log(`Updated tracking data with enhanced browser info for IP ${clientIp}`);
      }
    }
  }
  
  // Return success
  res.json({ success: true });
});

// Generate a trackable image for email embedding
app.get('/email-image/:id', async (req, res) => {
  const trackingId = req.params.id;
  console.log(`Generating tracking image for email embedding, ID: ${trackingId}`);
  
  const tracking = trackingDB[trackingId];
  
  if (!tracking) {
    return res.status(404).send('Image not found');
  }
  
  // Log all available info (similar to track-view)
  const clientIp = req.headers['x-forwarded-for'] || 
                  req.headers['cf-connecting-ip'] || 
                  req.headers['x-real-ip'] || 
                  req.connection.remoteAddress || 'Unknown';
  const rawUserAgent = req.headers['user-agent'] || 'Unknown';
  const userAgent = parseBrowser(rawUserAgent);
  const operatingSystem = parseOS(rawUserAgent);
  const language = req.headers['accept-language'] || 'Unknown';
  const referrer = req.headers.referer || 'Email Client';
  
  // Get approximate geolocation
  const geoInfo = await getIPGeolocation(clientIp);
  
  const viewData = {
    timestamp: new Date(),
    ip: clientIp,
    userAgent: userAgent,
    rawUserAgent: rawUserAgent,
    operatingSystem: operatingSystem,
    language: language,
    country: geoInfo.country,
    city: geoInfo.city,
    region: geoInfo.region,
    loc: geoInfo.loc,
    referrer: referrer,
    source: 'Email Embed',
    headers: Object.keys(req.headers).reduce((obj, key) => {
      // Filter out some sensitive headers
      if (!['cookie', 'authorization'].includes(key.toLowerCase())) {
        obj[key] = req.headers[key];
      }
      return obj;
    }, {})
  };
  
  tracking.views.push(viewData);
  console.log(`Recorded email view from ${clientIp} using ${userAgent} on ${operatingSystem}`);
  
  // Return the actual image
  res.sendFile(path.resolve(tracking.imagePath));
});

// Generate a clickable tracking image
app.get('/clickable-image/:id', async (req, res) => {
  const trackingId = req.params.id;
  console.log(`Generating clickable tracking image, ID: ${trackingId}`);
  
  const tracking = trackingDB[trackingId];
  
  if (!tracking) {
    return res.status(404).send('Image not found');
  }
  
  // Generate an HTML page with the image that has click tracking built in
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Image</title>
      <style>
        body { margin: 0; padding: 0; overflow: hidden; }
        img { display: block; width: 100%; height: 100vh; object-fit: contain; cursor: pointer; }
        .overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
      </style>
    </head>
    <body>
      <img src="${tracking.imageUrl}" alt="Image" id="trackableImage" />
      <div class="overlay" id="clickTracker"></div>
      
      <script>
        // Track click without navigation
        document.getElementById('clickTracker').addEventListener('click', function(e) {
          e.preventDefault();
          
          // Record the click
          fetch('/track-click/${trackingId}', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              x: e.clientX,
              y: e.clientY,
              screenWidth: window.innerWidth,
              screenHeight: window.innerHeight,
              timestamp: new Date().toISOString()
            })
          });
          
          // Show visual feedback (optional)
          const ripple = document.createElement('div');
          ripple.style.position = 'absolute';
          ripple.style.width = '20px';
          ripple.style.height = '20px';
          ripple.style.borderRadius = '50%';
          ripple.style.backgroundColor = 'rgba(255,255,255,0.7)';
          ripple.style.top = (e.clientY - 10) + 'px';
          ripple.style.left = (e.clientX - 10) + 'px';
          ripple.style.transition = 'transform 0.5s ease-out, opacity 0.5s ease-out';
          ripple.style.transform = 'scale(0)';
          ripple.style.opacity = '1';
          document.body.appendChild(ripple);
          
          // Animate and remove
          setTimeout(() => {
            ripple.style.transform = 'scale(3)';
            ripple.style.opacity = '0';
            setTimeout(() => {
              document.body.removeChild(ripple);
            }, 500);
          }, 0);
        });
        
        // Also track the view
        fetch('/track-view/${trackingId}');
        
        // Gather browser info
        const browserData = {
          screenWidth: window.screen.width,
          screenHeight: window.screen.height,
          colorDepth: window.screen.colorDepth,
          devicePixelRatio: window.devicePixelRatio,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          language: navigator.language || navigator.userLanguage,
          platformDetails: navigator.platform,
          cookiesEnabled: navigator.cookieEnabled,
          doNotTrack: navigator.doNotTrack,
          connectionType: navigator.connection ? navigator.connection.effectiveType : 'unknown',
          deviceMemory: navigator.deviceMemory ? navigator.deviceMemory + 'GB' : 'unknown',
          hardwareConcurrency: navigator.hardwareConcurrency || 'unknown'
        };
        
        // Send enhanced data
        fetch('/enhanced-tracking/${trackingId}', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(browserData)
        });
      </script>
    </body>
    </html>
  `;
  
  // Log basic view
  const clientIp = req.headers['x-forwarded-for'] || 
                  req.headers['cf-connecting-ip'] || 
                  req.headers['x-real-ip'] || 
                  req.connection.remoteAddress || 'Unknown';
  const rawUserAgent = req.headers['user-agent'] || 'Unknown';
  const userAgent = parseBrowser(rawUserAgent);
  const operatingSystem = parseOS(rawUserAgent);
  
  console.log(`Served clickable image to ${clientIp} using ${userAgent} on ${operatingSystem}`);
  
  res.send(html);
});

// Track image clicks
app.post('/track-click/:id', express.json(), async (req, res) => {
  const trackingId = req.params.id;
  const clickData = req.body;
  console.log(`Tracking click for ID: ${trackingId}`);
  
  const tracking = trackingDB[trackingId];
  
  if (!tracking) {
    return res.status(404).json({ error: 'Tracking ID not found' });
  }
  
  // Log all available info
  const clientIp = req.headers['x-forwarded-for'] || 
                  req.headers['cf-connecting-ip'] || 
                  req.headers['x-real-ip'] || 
                  req.connection.remoteAddress || 'Unknown';
  const rawUserAgent = req.headers['user-agent'] || 'Unknown';
  const userAgent = parseBrowser(rawUserAgent);
  const operatingSystem = parseOS(rawUserAgent);
  const language = req.headers['accept-language'] || 'Unknown';
  const referrer = req.headers.referer || 'Direct';
  
  // Get approximate geolocation
  const geoInfo = await getIPGeolocation(clientIp);
  
  // Find if this user already has a view
  let matchingView = null;
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  
  if (tracking.views && tracking.views.length > 0) {
    const recentViews = tracking.views.filter(view => 
      view.ip === clientIp && 
      new Date(view.timestamp) > fiveMinutesAgo
    );
    
    if (recentViews.length > 0) {
      matchingView = recentViews.sort((a, b) => 
        new Date(b.timestamp) - new Date(a.timestamp)
      )[0];
    }
  }
  
  // If there's a matching view, add click info to it
  if (matchingView) {
    if (!matchingView.clicks) {
      matchingView.clicks = [];
    }
    
    matchingView.clicks.push({
      timestamp: new Date(),
      clickData: clickData
    });
    
    matchingView.clickCount = (matchingView.clickCount || 0) + 1;
    matchingView.lastClickTime = new Date();
    
    console.log(`Added click to existing view for IP ${clientIp}`);
  } else {
    // Otherwise create a new tracking entry
    const viewData = {
      timestamp: new Date(),
      ip: clientIp,
      userAgent: userAgent,
      rawUserAgent: rawUserAgent,
      operatingSystem: operatingSystem,
      language: language,
      country: geoInfo.country,
      city: geoInfo.city,
      region: geoInfo.region,
      loc: geoInfo.loc,
      referrer: referrer,
      source: 'Clickable Image',
      clickCount: 1,
      lastClickTime: new Date(),
      clicks: [{
        timestamp: new Date(),
        clickData: clickData
      }],
      headers: Object.keys(req.headers).reduce((obj, key) => {
        if (!['cookie', 'authorization'].includes(key.toLowerCase())) {
          obj[key] = req.headers[key];
        }
        return obj;
      }, {})
    };
    
    tracking.views.push(viewData);
    console.log(`Created new click tracking entry for IP ${clientIp}`);
  }
  
  res.json({ success: true });
});

// Generate a downloadable tracking package
app.get('/downloadable-tracker/:id', async (req, res) => {
  const trackingId = req.params.id;
  console.log(`Generating downloadable tracking package for ID: ${trackingId}`);
  
  const tracking = trackingDB[trackingId];
  
  if (!tracking) {
    return res.status(404).send('Image not found');
  }
  
  // Generate an HTML file that looks like an image but has tracking capabilities
  const trackingHtml = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Image</title>
<style>
  body, html { 
    margin: 0; 
    padding: 0; 
    height: 100%; 
    width: 100%; 
    overflow: hidden;
    background-color: transparent;
  }
  img { 
    width: 100%; 
    height: 100%; 
    object-fit: contain;
    display: block;
  }
</style>
</head>
<body>
<img src="data:image/jpeg;base64,PLACE_BASE64_IMAGE_HERE" alt="">
<script>
  // Tracking functionality
  window.addEventListener('load', function() {
    try {
      // Create tracking request
      const trackingImg = new Image();
      trackingImg.style.position = 'absolute';
      trackingImg.style.width = '1px';
      trackingImg.style.height = '1px';
      trackingImg.style.opacity = '0.01';
      
      // Add timestamp to prevent caching
      const ts = new Date().getTime();
      trackingImg.src = 'SERVER_URL/stealth-track/${trackingId}?ts=' + ts;
      
      document.body.appendChild(trackingImg);
      
      // Send additional data if possible
      try {
        const data = {
          screen: window.screen ? {
            width: window.screen.width,
            height: window.screen.height,
            colorDepth: window.screen.colorDepth
          } : {},
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          language: navigator.language || navigator.userLanguage,
          platform: navigator.platform
        };
        
        // Use sendBeacon if available (works even if page closes quickly)
        if (navigator.sendBeacon) {
          navigator.sendBeacon('SERVER_URL/stealth-track-data/${trackingId}', JSON.stringify(data));
        } else {
          // Fallback to fetch
          fetch('SERVER_URL/stealth-track-data/${trackingId}', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
            keepalive: true
          }).catch(e => {});
        }
      } catch(e) {}
    } catch(e) {}
  });
</script>
</body>
</html>
  `;
  
  // Read the image file
  try {
    const imageBuffer = fs.readFileSync(path.resolve(tracking.imagePath));
    const base64Image = imageBuffer.toString('base64');
    
    // Replace placeholders with actual values
    const serverUrl = `${req.protocol}://${req.get('host')}`;
    let finalHtml = trackingHtml
      .replace('PLACE_BASE64_IMAGE_HERE', base64Image)
      .replace(/SERVER_URL/g, serverUrl);
    
    // Set filename to look like an image
    res.setHeader('Content-Disposition', `attachment; filename="image_${Date.now()}.html"`);
    res.setHeader('Content-Type', 'text/html');
    
    // Send the HTML file
    res.send(finalHtml);
    
    console.log(`Served downloadable tracking package for image ID: ${trackingId}`);
  } catch (error) {
    console.error('Error generating downloadable tracker:', error);
    res.status(500).send('Error generating tracker');
  }
});

// Handle stealth tracking requests from the downloadable HTML
app.get('/stealth-track/:id', async (req, res) => {
  const trackingId = req.params.id;
  console.log(`Received stealth tracking ping for ID: ${trackingId}`);
  
  const tracking = trackingDB[trackingId];
  
  if (!tracking) {
    return res.status(404).send('Not found');
  }
  
  // Log all available info
  const clientIp = req.headers['x-forwarded-for'] || 
                  req.headers['cf-connecting-ip'] || 
                  req.headers['x-real-ip'] || 
                  req.connection.remoteAddress || 'Unknown';
  const rawUserAgent = req.headers['user-agent'] || 'Unknown';
  const userAgent = parseBrowser(rawUserAgent);
  const operatingSystem = parseOS(rawUserAgent);
  const language = req.headers['accept-language'] || 'Unknown';
  const referrer = req.headers.referer || 'Downloaded HTML Image';
  
  // Get approximate geolocation
  const geoInfo = await getIPGeolocation(clientIp);
  
  const viewData = {
    timestamp: new Date(),
    ip: clientIp,
    userAgent: userAgent,
    rawUserAgent: rawUserAgent,
    operatingSystem: operatingSystem,
    language: language,
    country: geoInfo.country,
    city: geoInfo.city,
    region: geoInfo.region,
    loc: geoInfo.loc,
    referrer: referrer,
    source: 'Downloaded HTML Image',
    headers: Object.keys(req.headers).reduce((obj, key) => {
      if (!['cookie', 'authorization'].includes(key.toLowerCase())) {
        obj[key] = req.headers[key];
      }
      return obj;
    }, {})
  };
  
  tracking.views.push(viewData);
  console.log(`Recorded view from downloaded HTML image from ${clientIp}`);
  
  // Return a tiny transparent GIF
  const transparentGif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  res.set('Content-Type', 'image/gif');
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.send(transparentGif);
});

// Handle additional tracking data from the downloadable HTML
app.post('/stealth-track-data/:id', express.json(), async (req, res) => {
  const trackingId = req.params.id;
  const data = req.body;
  console.log(`Received additional tracking data for ID: ${trackingId}`);
  
  const tracking = trackingDB[trackingId];
  
  if (!tracking) {
    return res.status(404).json({ error: 'Not found' });
  }
  
  // Find the most recent view for this IP
  const clientIp = req.headers['x-forwarded-for'] || 
                  req.headers['cf-connecting-ip'] || 
                  req.headers['x-real-ip'] || 
                  req.connection.remoteAddress || 'Unknown';
  
  if (tracking.views && tracking.views.length > 0) {
    // Look for views from this IP in the last minute
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    
    const recentViews = tracking.views.filter(view => 
      view.ip === clientIp && 
      view.source === 'Downloaded HTML Image' && 
      new Date(view.timestamp) > oneMinuteAgo
    );
    
    if (recentViews.length > 0) {
      // Update the most recent view
      const latestView = recentViews.sort((a, b) => 
        new Date(b.timestamp) - new Date(a.timestamp)
      )[0];
      
      // Add the additional data
      latestView.enhancedData = data;
      
      // Set screen resolution if available
      if (data.screen && data.screen.width && data.screen.height) {
        latestView.screenResolution = `${data.screen.width}×${data.screen.height}`;
      }
      
      // Set timezone if available
      if (data.timezone) {
        latestView.timezone = data.timezone;
      }
      
      console.log(`Updated downloaded HTML image tracking with additional data for IP ${clientIp}`);
    }
  }
  
  res.json({ success: true });
});

// Ensure directories exist
if (!fs.existsSync('uploads/')) {
  console.log('Creating uploads directory');
  try {
    fs.mkdirSync('uploads/', { recursive: true });
    console.log('Uploads directory created successfully');
    // Set permissions (may be needed on some systems)
    fs.chmodSync('uploads/', 0o755);
  } catch (error) {
    console.error('Error creating uploads directory:', error);
    process.exit(1); // Exit if we can't create the directory
  }
}
if (!fs.existsSync('public/')) {
  console.log('Creating public directory');
  fs.mkdirSync('public/');
}

// Verify uploads directory is writable
try {
  fs.accessSync('uploads/', fs.constants.W_OK);
  console.log('Uploads directory is writable');
} catch (error) {
  console.error('Uploads directory is not writable:', error);
  process.exit(1);
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Start server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  
  // Display URLs for local network access
  const localIPs = getLocalIPs();
  if (localIPs.length > 0) {
    console.log('\nYou can also access this server on your local network at:');
    localIPs.forEach(ip => {
      console.log(`http://${ip}:${port}`);
    });
  }
  
  console.log(`\n- Static files served from: ${path.resolve('public')}`);
  console.log(`- Uploads directory: ${path.resolve('uploads')}`);
  
  console.log('\nTo use tracking:');
  console.log('1. Upload an image from the web interface');
  console.log('2. Copy the Tracking URL');
  console.log('3. Share this URL in WhatsApp, email, etc.');
  console.log('4. When the recipient views the image, their browser, IP, and device info will be logged');
});

// Function to get detailed geolocation and network info from IP
async function getIPGeolocation(ip) {
  console.log(`Looking up geolocation for IP: ${ip}`);
  
  // Clean up the IP address (remove IPv6 prefix if needed)
  let cleanIp = ip;
  if (ip.includes('::ffff:')) {
    cleanIp = ip.replace('::ffff:', '');
  }
  
  // Check if it's a private/local IP
  try {
    const addr = ipaddr.parse(cleanIp);
    const ipType = addr.range();
    
    if (['loopback', 'private', 'linkLocal', 'uniqueLocal'].includes(ipType)) {
      return {
        country: 'Local Network',
        city: 'Local Device',
        networkType: 'Private Network',
        ipVersion: addr.kind(),
        ipClass: ipType
      };
    }
    
    // Classify IPv6 addresses
    if (addr.kind() === 'ipv6') {
      let networkType = 'Public Network';
      
      // Try to determine if it's mobile or residential based on common patterns
      const ipString = addr.toString();
      
      if (ipString.includes('mobile') || ipString.includes('cellular')) {
        networkType = 'Mobile Network';
      }
      
      // For IPv6, we'll use geoip lookup but add our IPv6 classification
      const geo = geoip.lookup(cleanIp);
      if (geo) {
        return {
          ...geo,
          networkType,
          ipVersion: 'IPv6',
          ipClass: ipType
        };
      } else {
        // Use ipinfo.io API for IPv6 addresses (free tier has some limits)
        try {
          const response = await fetch(`https://ipinfo.io/${cleanIp}/json`);
          if (response.ok) {
            const data = await response.json();
            return {
              country: data.country || 'Unknown',
              city: data.city || 'Unknown',
              region: data.region || 'Unknown',
              timezone: data.timezone || 'Unknown',
              loc: data.loc || '',
              org: data.org || 'Unknown',
              networkType: data.org?.toLowerCase().includes('mobile') ? 'Mobile Network' : 
                          data.org?.toLowerCase().includes('business') ? 'Business Network' : 'Residential Network',
              ipVersion: 'IPv6',
              ipClass: ipType
            };
          }
        } catch (error) {
          console.error('Error using ipinfo.io API:', error);
        }
      }
    }
  } catch (e) {
    console.error('Error parsing IP address:', e);
  }
  
  // Try GeoIP lookup (works better for IPv4)
  const geo = geoip.lookup(cleanIp);
  
  if (geo) {
    // Add network type detection
    let networkType = 'Residential Network';
    
    // Some basic heuristics to guess network type
    if (geo.country === 'US' && cleanIp.includes('mobile')) {
      networkType = 'Mobile Network';
    } else if (geo.org && geo.org.toLowerCase().includes('mobile')) {
      networkType = 'Mobile Network';
    } else if (geo.org && (geo.org.toLowerCase().includes('business') || 
                          geo.org.toLowerCase().includes('corporate'))) {
      networkType = 'Business Network';
    }
    
    return {
      ...geo,
      networkType,
      ipVersion: cleanIp.includes(':') ? 'IPv6' : 'IPv4'
    };
  }
  
  // Try ipinfo.io as a fallback
  try {
    const response = await fetch(`https://ipinfo.io/${cleanIp}/json`);
    if (response.ok) {
      const data = await response.json();
      return {
        country: data.country || 'Unknown',
        city: data.city || 'Unknown',
        region: data.region || 'Unknown',
        timezone: data.timezone || 'Unknown',
        loc: data.loc || '',
        org: data.org || 'Unknown',
        networkType: data.org?.toLowerCase().includes('mobile') ? 'Mobile Network' : 
                   data.org?.toLowerCase().includes('business') ? 'Business Network' : 'Residential Network',
        ipVersion: cleanIp.includes(':') ? 'IPv6' : 'IPv4'
      };
    }
  } catch (error) {
    console.error('Error using ipinfo.io API:', error);
  }
  
  // If all else fails
  return {
    country: 'Unknown',
    city: 'Unknown',
    networkType: cleanIp.includes(':') ? 'IPv6 Network' : 'IPv4 Network',
    ipVersion: cleanIp.includes(':') ? 'IPv6' : 'IPv4',
    note: 'Limited geolocation information available'
  };
}