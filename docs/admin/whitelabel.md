# White-Label

Customize Karta's appearance to match your brand. Available with enterprise license.

## Accessing Settings

Navigate to **Admin > White-Label** in the sidebar (admin role required).

The page has two sections:
- **Left** — settings form (app name, colors, logo, favicon, CSS)
- **Right** — live preview showing how changes look in the header

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| **App Name** | Displayed in the header and browser title | Karta |
| **Primary Color** | Main brand color (header border, buttons) | System default |
| **Accent Color** | Secondary color for highlights | System default |
| **Custom CSS** | Raw CSS injected globally | Empty |
| **Logo** | Header logo image (PNG, JPG, SVG, WebP) | Karta icon |
| **Favicon** | Browser tab icon (PNG, ICO, SVG, WebP) | Default |

## How It Works

White-label settings are stored per-tenant. When the page loads, a `WhitelabelInjector` component in the app's providers reads the settings and injects CSS custom properties:

```css
:root {
  --wl-primary: #your-primary-color;
  --wl-accent: #your-accent-color;
}
```

Custom CSS is injected as a `<style>` tag. Changes take effect immediately — no page reload required.

## Logo and Favicon Upload

1. Click the upload button next to **Logo** or **Favicon**
2. Select an image file
3. The image is uploaded to the server and stored per-tenant
4. The header and browser tab update immediately

Supported formats:
- **Logo** — PNG, JPG, SVG, WebP
- **Favicon** — PNG, ICO, SVG, WebP

## Reset to Defaults

Click **Reset Defaults** to restore the original Karta branding (name, colors, remove custom CSS). Uploaded logos and favicons are not deleted but stop being displayed.

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/tenant/settings` | Public | Get current white-label settings |
| `PUT` | `/api/tenant/settings` | Admin | Update settings |
| `POST` | `/api/tenant/logo` | Admin | Upload logo image |
| `POST` | `/api/tenant/favicon` | Admin | Upload favicon image |
| `GET` | `/api/tenant/logo` | Public | Serve logo image |
| `GET` | `/api/tenant/favicon` | Public | Serve favicon image |

:::{tip}
The `GET /api/tenant/settings` endpoint is public (no authentication required) so the white-label branding loads even on the login page.
:::

:::{warning}
White-label requires an enterprise license with the `whitelabel` feature enabled. Without it, the Admin > White-Label page is not accessible.
:::
