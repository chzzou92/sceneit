import React from "react";
interface ErrorProps {
  type: string;
}
const ErrorCard: React.FC<ErrorProps> = ({ type }) => {
  let message = "";
  let title = "Please try again";

  switch (type) {
    case "no-text":
      message = "Please add text to search";
      break;
    case "no-url":
      message = "Please provide a video URL / S3 URI";
      break;
    case "already-split":
      title = "Note:"
      message = "This video is already processed.";
      break;
    default:
      title = "Error:"
      message = "An unknown error occurred";
  }
  return (
    <div className="flex flex-col gap-2 w-60 sm:w-72 text-[10px] sm:text-xs z-50">
      <div className="error-alert cursor-default flex items-center justify-between w-full h-12 sm:h-14 rounded-lg bg-[#232531] px-[10px]">
        <div className="flex gap-2">
          <div className="text-[#d65563] bg-white/5 backdrop-blur-xl p-1 rounded-lg">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
              className="w-6 h-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
              />
            </svg>
          </div>
          <div>
            <p className="text-white">{title}</p>
            <p className="text-gray-500">{message}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ErrorCard;
