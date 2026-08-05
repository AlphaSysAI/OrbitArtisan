# Voice AI Integration for Artisans

This module implements voice AI capabilities for artisans, allowing them to:
- Check availability via phone
- Schedule appointments
- Retrieve appointment information

## Architecture

### Files Structure

```
features/voice/
├── actions.ts              # Server actions for voice number management
├── lib/
│   └── tool-auth.ts       # Authentication and context resolution for voice calls
└── artisan/
    └── tools.ts           # Artisan-specific voice tools/functions
```

### API Routes

All routes require Bearer authentication with `VOICE_AI_TOOL_SECRET`.

- `POST /api/voice/artisan/availability` - Check available slots
- `POST /api/voice/artisan/schedule` - Schedule a new appointment
- `POST /api/voice/artisan/appointment-info` - Get appointment details

## How It Works

1. **Voice Platform Integration**: A third-party voice platform (e.g., Vapi, Retell) calls your endpoints
2. **Authentication**: The request includes a Bearer token that matches `VOICE_AI_TOOL_SECRET`
3. **Context Resolution**: The phone number (`called_number`) is used to find the artisan in `artisan_voice_numbers` table
4. **Tool Execution**: The appropriate tool is called with the artisan ID and request body
5. **Response**: Results are returned as JSON to the voice platform

## Database Schema

### Table: `artisan_voice_numbers`

Maps phone numbers (E.164 format) to artisans:

```sql
- id (uuid, primary key)
- artisan_id (uuid, references profiles)
- phone_e164 (text, unique) - Phone number in E.164 format (+33612345678)
- is_active (boolean) - Enable/disable voice AI for this artisan
- created_at (timestamptz)
- updated_at (timestamptz)
```

## Environment Variables

```env
# Required for voice AI to work
VOICE_AI_TOOL_SECRET=your-secret-key-here

# Also required
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

## Usage Example

### Get Availability

```bash
curl -X POST http://localhost:3000/api/voice/artisan/availability \
  -H "Authorization: Bearer your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{
    "called_number": "+33612345678",
    "start_date": "2026-08-10",
    "end_date": "2026-08-20"
  }'
```

### Schedule Appointment

```bash
curl -X POST http://localhost:3000/api/voice/artisan/schedule \
  -H "Authorization: Bearer your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{
    "called_number": "+33612345678",
    "customer_name": "Jean Dupont",
    "customer_email": "jean@example.com",
    "start_time": "2026-08-15T10:00:00Z"
  }'
```

## Server Actions

### Managing Voice Numbers

```typescript
// Get artisan's voice number
const result = await getArtisanVoiceNumber();

// Set/update artisan's voice number
const result = await setArtisanVoiceNumber("+33612345678");
```

These actions can be called from Artisan's settings page to configure their voice AI.

## Security

- Bearer token authentication prevents unauthorized voice tool access
- Artisan ID is derived from phone number on the server (not from request body)
- RLS policies ensure artisans can only manage their own voice numbers
- All routes use NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for server-side operations
