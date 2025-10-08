import React, { ChangeEventHandler } from "react";
import styled from "styled-components";

interface PhotoUploadProps {
  onChange: ChangeEventHandler<HTMLInputElement>;
}

const PhotoUpload: React.FC<PhotoUploadProps> = ({ onChange }) => {
  return (
    <StyledWrapper>
      <div className="input-div">
        <input
          className="input"
          name="file"
          accept="image/*"
          type="file"
          onChange={onChange}
        />
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="1em"
          height="1em"
          strokeLinejoin="round"
          strokeLinecap="round"
          viewBox="0 0 24 24"
          strokeWidth={2}
          fill="none"
          stroke="currentColor"
          className="icon"
        >
          <polyline points="16 16 12 12 8 16" />
          <line y2={21} x2={12} y1={12} x1={12} />
          <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
          <polyline points="16 16 12 12 8 16" />
        </svg>
      </div>
    </StyledWrapper>
  );
};

const StyledWrapper = styled.div`
  .input-div {
    position: relative;
    width: 45px;
    height: 45px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.7);
    display: flex;
    justify-content: center;
    align-items: center;
    overflow: hidden;
    transition: all 0.3s ease-in-out;
  }

  /* ✨ Glow only when hovered */
  .input-div:hover {
    border-color: #3b82f6;
    box-shadow: 0px 0px 40px #3b82f6, inset 0px 0px 10px #3b82f6,
      0px 0px 10px rgb(255, 255, 255);
    transform: scale(1.05);
  }

  .icon {
    color: #3b82f6;
    font-size: 2rem;
    cursor: pointer;
    opacity: 1;
    transition: all 0.3s ease-in-out;
  }

  .input-div:hover .icon {
    opacity: 1;
    transform: scale(1.1);
    filter: drop-shadow(0 0 8px #3b82f6);
  }

  .input {
    position: absolute;
    opacity: 0;
    width: 100%;
    height: 100%;
    z-index: 10;  
    cursor: pointer !important;
  }
`;

export default PhotoUpload;
