import { useNavigate } from "react-router";

const Navbar = () => {
  const navigate = useNavigate();

  const homeButton = () => {
    navigate("/");
  };

  const analyzeButton = () => {
    navigate("/predict");
  };

  return (
    // <div className="flex flex-row justify-between text-white pt-4 pb-4 pl-8 pr-8">
    <div className="flex  sm:flex-row justify-between items-center text-white py-4 px-6 sm:px-8 gap-4 ">
      <h1 className="text-2xl sm:text-lg font-bold pl-4 text-cyan-300">
        <button type="hidden" onClick={homeButton}>
          VibeCheckr
        </button>
      </h1>
      {/* <div className="flex flex-row sm:flex-row  justify-center sm:justify-end  gap-3 sm:gap-0"> */}
      <div className="flex justify-end gap-3 @480:justify-center @480:gap-1 @390:gap-1">
        <button
          className="px-4 py-2 border-2 border-cyan-300 @390:px-1   rounded-md "
          onClick={homeButton}
        >
          Home
        </button>
        <button
          className="px-4 py-2 border-2 border-cyan-300 @390:px-1   rounded-md "
          onClick={analyzeButton}
        >
          Analyze
        </button>
      </div>
    </div>
  );
};

export default Navbar;
