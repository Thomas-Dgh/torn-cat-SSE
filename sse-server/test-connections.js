// Script pour tester différentes URLs de connexion
import { Client } from 'pg';

const urls = [
  // Direct connection
  'postgresql://postgres:pfqmpdo6oYZ4bB06@db.vcxzqgrivbgwewmaaiye.supabase.co:5432/postgres',
  
  // Pooling URLs possibles (EU-Central-1)
  'postgres://postgres.vcxzqgrivbgwewmaaiye:pfqmpdo6oYZ4bB06@aws-0-eu-central-1.pooler.supabase.com:5432/postgres',
  'postgres://postgres.vcxzqgrivbgwewmaaiye:pfqmpdo6oYZ4bB06@aws-0-eu-central-1.pooler.supabase.com:6543/postgres',
  
  // Avec paramètres
  'postgresql://postgres:pfqmpdo6oYZ4bB06@db.vcxzqgrivbgwewmaaiye.supabase.co:5432/postgres?sslmode=require',
];

async function testConnection(url) {
  console.log(`\nTesting: ${url.substring(0, 50)}...`);
  
  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    await client.connect();
    console.log('✅ Connected successfully!');
    await client.query('SELECT NOW()');
    console.log('✅ Query successful!');
    await client.end();
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

console.log('Testing database connections...\n');

for (const url of urls) {
  await testConnection(url);
}