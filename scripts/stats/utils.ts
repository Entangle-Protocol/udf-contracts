
// Function to format a timestamp into a human-readable string
export function formatTimestampPast(
    timePassed: number | bigint
): string {

    if (typeof timePassed === "bigint") {
	timePassed = Number(timePassed);
    }

    if (timePassed < 5) {
	return "just now";
    } else if (timePassed < 60) {
	return `${timePassed} seconds ago`;
    } else if (timePassed < 3600) {
	return `${Math.floor(timePassed / 60)} minutes ago`;
    } else if (timePassed < 86400) {
	return `${Math.floor(timePassed / 3600)} hours ago`;
    } else if (timePassed < 604800) {
	return `${Math.floor(timePassed / 86400)} days ago`;
    }

    return "more than a week ago";
}
