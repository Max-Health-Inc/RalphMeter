/**
 * Sample app for testing coverage instrumentation
 * This is a simple Node.js app that runs a few functions
 */

function add(a, b) {
  return a + b;
}

function multiply(a, b) {
  return a * b;
}

function unused() {
  return 'This function is never called';
}

// Execute some functions
console.log('Starting sample app...');
const sum = add(2, 3);
console.log('Sum:', sum);

const product = multiply(4, 5);
console.log('Product:', product);

console.log('Sample app finished');

// Exit after a short delay to allow coverage to be written
setTimeout(() => {
  process.exit(0);
}, 100);
