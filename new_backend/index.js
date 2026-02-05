//just to see if lambda was even working lol, no longer in use

// // Minimal smoke test Lambda handler
// // Logs the incoming event and returns it back in the response.
// // Works without any extra AWS calls.

// exports.handler = async (event) => {
// 	console.log('Lambda alive, event:', JSON.stringify(event));
// 	return {
// 		statusCode: 200,
// 		body: JSON.stringify({ ok: true, echo: event })
// 	};
// };