import { Route, Routes } from "react-router";
import HomePage from "./pages/HomePage";
import PredictionPage from "./pages/PredictionPage";
import About from "./pages/About";

const App = () => {
  return (
    <div>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/predict" element={<PredictionPage />} />
      </Routes>
    </div>
  );
};

export default App;
