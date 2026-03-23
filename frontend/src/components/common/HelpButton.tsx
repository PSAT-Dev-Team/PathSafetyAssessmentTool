import { useNavigate } from "react-router-dom";

export default function HelpButton() {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate("/help")}
      style={{
        position: "fixed",
        top: "8px",
        left: "8px",
        width: "40px",
        height: "40px",
        borderRadius: "50%",
        backgroundColor: "#ffffff",
        color: "#2c3e50",
        border: "2px solid #e0e6ed",
        fontSize: "20px",
        fontWeight: "bold",
        cursor: "pointer",
        zIndex: 9999,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
        transition: "all 0.2s ease",
      }}
      aria-label="Go to Developer, User, and Admin Page"
      title="Developer, User, and Admin Page"
      onMouseOver={(e) => {
        e.currentTarget.style.transform = "scale(1.1)";
        e.currentTarget.style.boxShadow = "0 4px 15px rgba(0,0,0,0.15)";
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.transform = "scale(1)";
        e.currentTarget.style.boxShadow = "0 2px 10px rgba(0,0,0,0.1)";
      }}
    >
      ?
    </button>
  );
}
