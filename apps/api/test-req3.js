fetch('http://localhost:4000/api/auth/get-session', {
  headers: {
    'cookie': 'better-auth.session_token=pHMy0zKy814ChgU12ETsUvHyYCH2BlR1'
  }
}).then(async r => {
  console.log(r.status, await r.json());
}).catch(console.error);
