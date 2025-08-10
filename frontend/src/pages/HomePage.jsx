import Navbar from "../components/Navbar.jsx";
import bgImg from "../assets/home-bg-image.png";
import { useNavigate } from "react-router";
import MicIcon from "@mui/icons-material/Mic";

const HomePage = () => {
  const navigate = useNavigate();

  const demoButton = () => {
    navigate("/predict");
  };

  return (
    <div className="relative flex size-full min-h-screen flex-col bg-[#112222] justify-between overflow-x-auto">
      <Navbar />
      <div className="flex flex-1 flex-col items-center justify-center">
        <div className="flex items-center bg-[#112222] p-4 pb-2 justify-between"></div>
        <div>
          <div
            className="flex-1 bg-cover bg-center bg-no-repeat flex items-center justify-center px-4 "
            style={{ backgroundImage: `url(${bgImg})` }}
          >
            <div className="flex flex-col gap-6 bg-black/50 items-center justify-center text-center max-w-xl p-6 rounded-xl min-h-screen">
              <div className="flex flex-col gap-2 text-center">
                <h1 className="text-white text-4xl font-black leading-tight tracking-[-0.033em] @[480px]:text-5xl @[480px]:font-black @[480px]:leading-tight @[480px]:tracking-[-0.033em]">
                  Speech Emotion Recognition
                </h1>
                <h2 className="text-white text-sm font-normal leading-normal @[480px]:text-base @[480px]:font-normal @[480px]:leading-normal">
                  Analyze emotions in real-time with our advanced SER
                  technology. Experience the power of understanding human
                  emotions through speech.
                </h2>
              </div>
              <button
                className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-full h-10 px-4 @[480px]:h-12 @[480px]:px-5 border-2 border-black bg-[#47eaea] text-[#112222] text-sm font-bold leading-normal tracking-[0.015em] @[480px]:text-base @[480px]:font-bold @[480px]:leading-normal @[480px]:tracking-[0.015em] "
                onClick={demoButton}
              >
                <MicIcon />
                <span className="truncate">Try Live Demo</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
