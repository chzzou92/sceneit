import React from "react";
import styled from "styled-components";

interface SearchInputProps {
  text: string;
  setText: (value: string) => void;
}

const SearchInput: React.FC<SearchInputProps> = ({ text, setText }) => {
  return (
    <StyledWrapper>
      <input
        type="text"
        autoComplete="off"
        name="text"
        className="input"
        placeholder="Text to search video..."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
    </StyledWrapper>
  );
};

const StyledWrapper = styled.div`
  .input {
    border: none;
    outline: none;
    color: black;
    border-radius: 15px;
    padding: 1em;
    background-color: #ccc;
    box-shadow: inset 2px 5px 10px rgba(0, 0, 0, 0.3);
    transition: 300ms ease-in-out;
  }

  .input:focus {
    background-color: white;
    transform: scale(1.05);
    box-shadow: 13px 13px 100px #969696, 0px 0px 50px #ffffff;
  }
`;

export default SearchInput;
