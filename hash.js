// hash.js
import bcrypt from 'bcrypt';

const password = 'devpassword'; // whatever password you want
const hash = await bcrypt.hash(password, 10);

console.log('Password hash:', hash);
