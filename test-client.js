const net = require('net');

// Create test data for LawBridge protocol
function createTestData() {
    const testSequence = [
        // Page number command: 0x02 P 0x1D 0x02 0x03 (page 541)
        Buffer.from([0x02, 0x50, 0x1D, 0x02, 0x03]),

        // Line number command: 0x02 N 0x12 0x03 (line 18)
        Buffer.from([0x02, 0x4E, 0x12, 0x03]),

        // Format command: 0x02 F 0x01 0x03 (Question format)
        Buffer.from([0x02, 0x46, 0x01, 0x03]),

        // Text: "Q. What is your name?"
        Buffer.from("Q. What is your name?"),

        // Format command: 0x02 F 0x02 0x03 (Answer format)
        Buffer.from([0x02, 0x46, 0x02, 0x03]),

        // Text: "A. My name is John Smith."
        Buffer.from("A. My name is John Smith."),

        // Timecode command: 0x02 T 0x11 0x05 0x0C 0x02 0x03 (17:05:12.02)
        Buffer.from([0x02, 0x54, 0x11, 0x05, 0x0C, 0x02, 0x03]),

        // More text
        Buffer.from(" Thank you.")
    ];

    return testSequence;
}

function runTest() {
    console.log('Starting LawBridge protocol test client...');

    const client = new net.Socket();

    client.connect(8080, 'localhost', () => {
        console.log('Connected to Bridge Viewer server');

        const testData = createTestData();
        let index = 0;

        // Send test data with delays to simulate real-time input
        const sendNextChunk = () => {
            if (index < testData.length) {
                console.log(`Sending chunk ${index + 1}/${testData.length}:`, testData[index]);
                client.write(testData[index]);
                index++;
                setTimeout(sendNextChunk, 1000); // 1 second delay between chunks
            } else {
                console.log('All test data sent. Keeping connection open...');
                // Keep connection open for a bit then close
                setTimeout(() => {
                    console.log('Closing connection');
                    client.end();
                }, 5000);
            }
        };

        // Start sending data after a short delay
        setTimeout(sendNextChunk, 1000);
    });

    client.on('data', (data) => {
        console.log('Received response:', data.toString());
    });

    client.on('close', () => {
        console.log('Connection closed');
        process.exit(0);
    });

    client.on('error', (err) => {
        console.error('Connection error:', err);
        process.exit(1);
    });
}

// Run the test
runTest();