# BasedOn

An interactive movie platform where users extend branching narratives through AI-generated video scenes. Built as a Base mini app using OnchainKit and the Farcaster SDK.

## Prerequisites

Before getting started, make sure you have:

* Base app account
* A [Farcaster](https://farcaster.xyz/) account
* [Vercel](https://vercel.com/) account for hosting the application
* [Coinbase Developer Platform](https://portal.cdp.coinbase.com/) Client API Key

## Getting Started

### 1. Clone this repository

```bash
git clone https://github.com/your-org/basedon.git
```

### 2. Install dependencies:

```bash
cd basedon
npm install
```

### 3. Configure environment variables

Create a `.env.local` file and add your environment variables:

```bash
# App Configuration
NEXT_PUBLIC_PROJECT_NAME="BasedOn"
NEXT_PUBLIC_ONCHAINKIT_API_KEY=<Replace-WITH-YOUR-CDP-API-KEY>
NEXT_PUBLIC_URL=

# Database (Neon PostgreSQL)
POSTGRES_URL=<Your-Neon-Postgres-URL>

# Video Storage (Cloudflare R2)
AWS_REGION=auto
AWS_ACCESS_KEY_ID=<Your-R2-Access-Key>
AWS_SECRET_ACCESS_KEY=<Your-R2-Secret-Key>
AWS_S3_BUCKET_NAME=scenes
```

### 4. Set up the database:

```bash
npm run db:migrate
```

### 5. Run locally:

```bash
npm run dev
```

The app will be available at http://localhost:3001

## Project Structure

- `app/` - Next.js app directory with pages and API routes
- `app/components/` - React components
- `app/types/` - TypeScript type definitions
- `schema.md` - Database schema documentation
- `MOVIE_PLATFORM.md` - Platform design and mechanics
- `minikit.config.ts` - Farcaster manifest configuration

## Deployment

### 1. Deploy to Vercel

```bash
vercel --prod
```

You should have a URL deployed to a domain similar to: `https://your-vercel-project-name.vercel.app/`

### 2. Update environment variables

Add your production URL to your local `.env` file:

```bash
NEXT_PUBLIC_PROJECT_NAME="BasedOn"
NEXT_PUBLIC_ONCHAINKIT_API_KEY=<Replace-WITH-YOUR-CDP-API-KEY>
NEXT_PUBLIC_URL=https://your-vercel-project-name.vercel.app/
```

### 3. Upload environment variables to Vercel

Add all environment variables to your production environment:

```bash
vercel env add NEXT_PUBLIC_PROJECT_NAME production
vercel env add NEXT_PUBLIC_ONCHAINKIT_API_KEY production
vercel env add NEXT_PUBLIC_URL production
vercel env add POSTGRES_URL production
vercel env add AWS_REGION production
vercel env add AWS_ACCESS_KEY_ID production
vercel env add AWS_SECRET_ACCESS_KEY production
vercel env add AWS_S3_BUCKET_NAME production
```

## Account Association

### 1. Sign Your Manifest

1. Navigate to [Farcaster Manifest tool](https://farcaster.xyz/~/developers/mini-apps/manifest)
2. Paste your domain in the form field (ex: your-vercel-project-name.vercel.app)
3. Click the `Generate account association` button and follow the on-screen instructions for signing with your Farcaster wallet
4. Copy the `accountAssociation` object

### 2. Update Configuration

Update your `minikit.config.ts` file to include the `accountAssociation` object:

```ts
export const minikitConfig = {
    accountAssociation: {
        "header": "your-header-here",
        "payload": "your-payload-here",
        "signature": "your-signature-here"
    },
    frame: {
        // ... rest of your frame configuration
    },
}
```

### 3. Deploy Updates

```bash
vercel --prod
```

## Testing and Publishing

### 1. Preview Your App

Go to [base.dev/preview](https://base.dev/preview) to validate your app:

1. Add your app URL to view the embeds and click the launch button to verify the app launches as expected
2. Use the "Account association" tab to verify the association credentials were created correctly
3. Use the "Metadata" tab to see the metadata added from the manifest and identify any missing fields

### 2. Publish to Base App

To publish your app, create a post in the Base app with your app's URL.

## Technology Stack

- **Framework**: Next.js 15 with App Router
- **Blockchain**: Base (Ethereum L2)
- **Wallet Integration**: OnchainKit
- **Database**: PostgreSQL (Neon)
- **Video Storage**: Cloudflare R2
- **Styling**: Tailwind CSS v4
- **AI**: GPT-4o-mini for prompt refinement

## Documentation

- `MOVIE_PLATFORM.md` - Platform design and mechanics
- `schema.md` - Database schema and architecture
- [Base Mini Apps](https://docs.base.org/docs/mini-apps/quickstart/create-new-miniapp/)
- [OnchainKit](https://onchainkit.xyz/)