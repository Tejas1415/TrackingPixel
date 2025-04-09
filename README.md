# TrackingPixel
An application to embed information into an image and record who opened that image for tracking purposes
# Image Tracking System Guide

This guide explains how to set up and use the advanced image tracking system for monitoring when and how someone views your shared content. This system offers multiple tracking methods and collects comprehensive viewer information.

## Features

The system offers multiple tracking methods:

1. **Tracking URL**: Basic tracking by sharing a URL that displays your image
2. **Email Tracking**: Embed trackable images in emails to know when they're opened
3. **Downloadable Tracking Images**: Special HTML files that look like regular images but can track when shared directly

## Collected Information

When someone views your content, the system records:

- IP address
- Browser type and version
- Operating system
- Device type (mobile, desktop, tablet)
- Approximate location (city/country)
- Screen resolution and color depth
- Language settings
- Timezone
- Device capabilities (RAM, CPU cores, network type)
- Referrer information (where they came from)
- Exact date and time of viewing

## Setting Up the Server

### Requirements

- Node.js (v14+)
- NPM or Yarn
- A server to host the application (Heroku, AWS, DigitalOcean, etc.)

### Installation Steps

1. Clone the repository or create the files as shown in the code
2. Install dependencies:

```bash
npm install express multer uuid path fs
```

3. Create the required directories:

```bash
mkdir uploads
mkdir public
```

4. Start the server:

```bash
node server.js
```

5. The server will run on port 3000 by default (customize via PORT environment variable)

## How to Use

### Basic Tracking URL

1. Upload an image through the web interface
2. Copy the tracking URL
3. Share this URL via WhatsApp, email, or any messaging platform
4. When someone opens the URL, their visit is tracked

### Email Tracking

1. Upload an image through the web interface
2. Copy the HTML code provided in the "Email Image Tracking" section
3. Paste this HTML into your email content (must be HTML-formatted email)
4. When recipients open the email and load the image, their view is tracked

### Downloadable Tracking Image

1. Upload an image through the web interface
2. Click the "Download Trackable Image" button
3. Share this downloaded file directly with recipients (via WhatsApp, email attachments, etc.)
4. When they open the file, it will appear as a normal image but will track their view

### Viewing Tracking Data

- All tracking data appears in the "Tracking Results" table
- Different tracking methods are color-coded for easy identification:
  - Email tracking: Amber background
  - Downloaded image tracking: Green background
- Click the "Refresh Tracking Data" button to see the latest results

## Enhanced Geolocation

For production use, the system includes code to integrate with geolocation APIs:

1. Uncomment the geolocation API code in server.js
2. Sign up for a service like ipinfo.io, ipapi.co, or similar
3. Add your API key to the configuration
4. Deploy to your production server

This will provide accurate location data including country, city, region, and coordinates.

## Security and Privacy Considerations

- This system collects information that is typically accessible to websites
- Consider adding authentication to your tracking dashboard
- Be transparent about data collection for legitimate use cases
- Review privacy laws in your jurisdiction regarding tracking and data collection

## Legal and Ethical Usage

This tool should only be used ethically and legally. Appropriate uses include:

- Identifying the source of harassment or unwanted messages
- Confirming if important messages have been viewed
- Understanding communication patterns for legitimate purposes

## Troubleshooting

- **No QR code appearing**: The system now includes multiple fallbacks for QR generation
- **Image not tracking**: Some platforms and email clients block remote content
- **HTML image not working**: Ensure recipients open the file in a browser

## Customization Options

The system can be extended with:

1. **Authentication**: Add user accounts to protect the tracking dashboard
2. **Email Notifications**: Get alerts when your content is viewed
3. **Advanced Analytics**: Track view patterns over time
4. **Database Storage**: Replace in-memory storage with a database for persistence
