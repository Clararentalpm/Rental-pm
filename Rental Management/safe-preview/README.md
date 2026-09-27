# Safe manual preview (PR #28)

Open `index.html` via the HTTPS preview URL (not production Netlify / GitHub Pages).

- **Connects to production Supabase?** NO
- **Data:** in-browser TEST DATA only
- **Save:** updates test data in this browser only

## Checklist

1. Carindale → Room Profiles → Room 3: Ensuite badge + Bathroom = Ensuite
2. Carindale Room 4: no Ensuite badge; Bathroom ≠ Ensuite
3. Edit profile → confirm fields → close → Refresh page → still correct
4. Availability / Calendar / Room Status / Book inspection / Find Room labels (test bookings)
5. McGregor tab: labels + multi-room test booking segments unchanged by Carindale rules
