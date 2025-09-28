const net = require('net');

// Create proper LawBridge protocol test data
function createProtocolTestData() {
    const testSequence = [];

    // Start with page 1
    testSequence.push(Buffer.from([0x02, 0x50, 0x01, 0x00, 0x03])); // P command: page 1

    // Line 1 - Question format
    testSequence.push(Buffer.from([0x02, 0x4E, 0x01, 0x03])); // N command: line 1
    testSequence.push(Buffer.from([0x02, 0x46, 0x01, 0x03])); // F command: Question format
    testSequence.push(Buffer.from([0x02, 0x54, 0x11, 0x05, 0x0C, 0x02, 0x03])); // T command: timecode
    testSequence.push(Buffer.from("          SP01:  No, I did not."));

    // Line 2 - Answer format
    testSequence.push(Buffer.from([0x02, 0x4E, 0x02, 0x03])); // N command: line 2
    testSequence.push(Buffer.from([0x02, 0x46, 0x02, 0x03])); // F command: Answer format
    testSequence.push(Buffer.from([0x02, 0x54, 0x11, 0x05, 0x0D, 0x05, 0x03])); // T command: timecode
    testSequence.push(Buffer.from("          SP02:  What was your role?  Limited role"));

    // Line 3 - continuation
    testSequence.push(Buffer.from([0x02, 0x4E, 0x03, 0x03])); // N command: line 3
    testSequence.push(Buffer.from([0x02, 0x46, 0x05, 0x03])); // F command: Answer continuation
    testSequence.push(Buffer.from([0x02, 0x54, 0x11, 0x05, 0x0E, 0x08, 0x03])); // T command: timecode
    testSequence.push(Buffer.from("     that night."));

    // Line 4 - Question format
    testSequence.push(Buffer.from([0x02, 0x4E, 0x04, 0x03])); // N command: line 4
    testSequence.push(Buffer.from([0x02, 0x46, 0x01, 0x03])); // F command: Question format
    testSequence.push(Buffer.from([0x02, 0x54, 0x11, 0x05, 0x0F, 0x0A, 0x03])); // T command: timecode
    testSequence.push(Buffer.from("          SP01:  To process any evidence that was"));

    // Line 5 - continuation
    testSequence.push(Buffer.from([0x02, 0x4E, 0x05, 0x03])); // N command: line 5
    testSequence.push(Buffer.from([0x02, 0x46, 0x04, 0x03])); // F command: Question continuation
    testSequence.push(Buffer.from([0x02, 0x54, 0x11, 0x05, 0x10, 0x0C, 0x03])); // T command: timecode
    testSequence.push(Buffer.from("     discovered during the search."));

    // Line 6 - Answer format
    testSequence.push(Buffer.from([0x02, 0x4E, 0x06, 0x03])); // N command: line 6
    testSequence.push(Buffer.from([0x02, 0x46, 0x02, 0x03])); // F command: Answer format
    testSequence.push(Buffer.from([0x02, 0x54, 0x11, 0x05, 0x11, 0x0F, 0x03])); // T command: timecode
    testSequence.push(Buffer.from("          SP02:  When you say processed the evidence,"));

    // Line 7 - continuation with refresh example
    testSequence.push(Buffer.from([0x02, 0x4E, 0x07, 0x03])); // N command: line 7
    testSequence.push(Buffer.from([0x02, 0x46, 0x05, 0x03])); // F command: Answer continuation
    testSequence.push(Buffer.from([0x02, 0x54, 0x11, 0x05, 0x12, 0x10, 0x03])); // T command: timecode
    testSequence.push(Buffer.from("     can you explain briefly?"));

    return testSequence;
}

// Test refresh command
function createRefreshTestData() {
    const refreshSequence = [];

    // Refresh command: replace content between two timecodes
    // Start: 17:05:13.05, End: 17:05:14.10
    refreshSequence.push(Buffer.from([
        0x02, 0x52, // R command
        0x11, 0x05, 0x0D, 0x05, // Start timecode
        0x11, 0x05, 0x0E, 0x0A, // End timecode
        0x03
    ]));

    // Replacement text (will replace lines 2-3)
    refreshSequence.push(Buffer.from([0x02, 0x4E, 0x02, 0x03])); // N command: line 2
    refreshSequence.push(Buffer.from([0x02, 0x46, 0x02, 0x03])); // F command: Answer format
    refreshSequence.push(Buffer.from([0x02, 0x54, 0x11, 0x05, 0x0D, 0x05, 0x03])); // T command
    refreshSequence.push(Buffer.from("          SP02:  What was your specific role that evening?"));

    // End refresh
    refreshSequence.push(Buffer.from([0x02, 0x45, 0x03])); // E command

    return refreshSequence;
}

function runTest() {
    console.log('Starting LawBridge Protocol Test Client...');
    console.log('This test sends proper protocol-compliant data');

    const client = new net.Socket();

    client.connect(8080, 'localhost', () => {
        console.log('Connected to Bridge Viewer server on port 8080');

        const testData = createProtocolTestData();
        let index = 0;

        // Send test data with delays to simulate real-time input
        const sendNextChunk = () => {
            if (index < testData.length) {
                const chunk = testData[index];
                console.log(`\nSending chunk ${index + 1}/${testData.length}:`);

                // Display hex for commands, text for text
                if (chunk[0] === 0x02) {
                    console.log('  Command:', chunk.toString('hex'));
                } else {
                    console.log('  Text:', chunk.toString());
                }

                client.write(chunk);
                index++;
                setTimeout(sendNextChunk, 500); // 500ms delay between chunks
            } else {
                console.log('\n=== Initial data sent, waiting 3 seconds then sending refresh test ===\n');

                // After initial data, send refresh test
                setTimeout(() => {
                    console.log('Sending refresh command sequence...');
                    const refreshData = createRefreshTestData();

                    let refreshIndex = 0;
                    const sendRefreshChunk = () => {
                        if (refreshIndex < refreshData.length) {
                            const chunk = refreshData[refreshIndex];
                            if (chunk[0] === 0x02) {
                                console.log('  Refresh command:', chunk.toString('hex'));
                            } else {
                                console.log('  Refresh text:', chunk.toString());
                            }
                            client.write(chunk);
                            refreshIndex++;
                            setTimeout(sendRefreshChunk, 300);
                        } else {
                            console.log('\nRefresh test complete. Connection will close in 5 seconds...');
                            setTimeout(() => {
                                console.log('Closing connection');
                                client.end();
                            }, 5000);
                        }
                    };
                    sendRefreshChunk();
                }, 3000);
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