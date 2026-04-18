export interface AsyncDataInteractionPort<Data, Err = Error> {
  setLoading: (isLoading: boolean) => void;
  displayData: (data: Data) => void;
  displayError: (error: Err) => void;
}
