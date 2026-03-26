# rifft-crewai

CrewAI adapter for [Rifft](https://github.com/rifft-dev/rifft).

`rifft-crewai` instruments CrewAI agent runs, tool calls, and handoffs so they appear in Rifft traces with communication edges and MAST failure analysis.

## Install

```bash
pip install rifft-sdk rifft-crewai
```

## Usage

```python
import rifft
import rifft.adapters.crewai

rifft.init(service_name="my-crewai-app")
rifft.adapters.crewai.instrument()
```

Then run your CrewAI workflow normally and open Rifft to inspect the trace.
