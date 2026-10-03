fetch('http://localhost:4000/api/v1/onboarding/empty', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer pHMy0zKy814ChgU12ETsUvHyYCH2BlR1'
  }
}).then(async r => {
  console.log(r.status, await r.text());
}).catch(console.error);
