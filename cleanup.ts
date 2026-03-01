import fs from 'fs';
import path from 'path';

const dir = '/app/%28auth%29';
if (fs.existsSync(dir)) {
  console.log(`Deleting ${dir}`);
  fs.rmSync(dir, { recursive: true, force: true });
} else {
  console.log(`${dir} does not exist`);
}

const dir2 = '/app/(auth)';
if (fs.existsSync(dir2)) {
  console.log(`${dir2} exists`);
} else {
  console.log(`${dir2} does not exist`);
}
