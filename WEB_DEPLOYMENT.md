# Web Deployment Guide - Spark Walk

## ✅ Web Configuration Complete

Your Interval Walking Timer app is now properly configured for web deployment!

### What Was Fixed

1. **Haptics Support for Web**
   - Added Platform-aware haptics wrapper in [app/walk-timer.tsx](app/walk-timer.tsx)
   - Haptic feedback now safely disabled on web (mobile-only feature)
   - No errors when running on browsers

2. **Web Configuration in app.json**
   - Added PWA metadata (name, description, theme colors)
   - Configured as standalone web app
   - Set proper favicon and icons

3. **Custom Web HTML Template**
   - Created [web/index.html](web/index.html) with:
     - SEO meta tags
     - PWA theme color
     - Loading spinner
     - Mobile-optimized viewport

4. **Platform-Specific Code**
   - Share functionality already has web fallback in [lib/actions/invites.ts](lib/actions/invites.ts)
   - Uses clipboard API on web

### Development

Run the web version locally:
```bash
npm run web
```

This will start the development server at http://localhost:8081

### Building for Production

Build a static web bundle:
```bash
npm run build
```

This creates an optimized static website in the `dist/` folder.

### Deployment Options

#### 1. **Vercel** (Recommended)
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

#### 2. **Netlify**
```bash
# Build first
npm run build

# Deploy the dist folder via Netlify CLI or drag & drop in UI
```

#### 3. **GitHub Pages**
```bash
# Build
npm run build

# Deploy dist folder to gh-pages branch
```

#### 4. **Any Static Host**
The `dist/` folder contains a complete static website that can be hosted anywhere:
- AWS S3 + CloudFront
- Google Firebase Hosting
- Azure Static Web Apps
- Your own web server

### Environment Variables

Make sure to set these in your hosting provider's environment:
- `EXPO_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anon key

### Web-Specific Notes

**Features that work on web:**
- ✅ All screens and navigation
- ✅ Timer functionality
- ✅ Supabase authentication
- ✅ Data storage
- ✅ Share (via clipboard)
- ✅ Responsive design

**Mobile-only features (gracefully disabled on web):**
- Haptic feedback
- Native gestures (swipes use web alternatives)

### Testing

Before deploying:
1. Test all screens work: ✅
2. Test login/signup: ✅
3. Test timer functionality: ✅
4. Test on different browsers
5. Test responsive design on mobile viewports

### Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

---

## Quick Deploy Commands

```bash
# Development
npm run web

# Production build
npm run build

# Deploy to Vercel
vercel --prod

# Clear cache if needed
npm run clear
```

Your app is ready for web deployment! 🚀
